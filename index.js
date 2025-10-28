// ===============================
// AI71 Legal Request Bot
// ===============================

import { App } from "@slack/bolt";
import express from "express";
import fetch from "node-fetch";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN, // starts with xoxb-
  signingSecret: process.env.SLACK_SIGNING_SECRET, // from Slack App
  socketMode: false,
  appToken: process.env.SLACK_APP_TOKEN, // optional for events
  port: process.env.PORT || 3000
});

// Your Google Apps Script Web App URL
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

// ===============================
// Slash command: /legal
// Opens a modal for submitting new requests
// ===============================
app.command("/legal", async ({ ack, body, client }) => {
  await ack();
  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "legal_request_form",
        title: {
          type: "plain_text",
          text: "New Legal Request"
        },
        submit: {
          type: "plain_text",
          text: "Submit"
        },
        close: {
          type: "plain_text",
          text: "Cancel"
        },
        blocks: [
          {
            type: "input",
            block_id: "type_block",
            label: {
              type: "plain_text",
              text: "Request Type"
            },
            element: {
              type: "static_select",
              action_id: "request_type",
              placeholder: {
                type: "plain_text",
                text: "Select a request type"
              },
              options: [
                {
                  text: { type: "plain_text", text: "Procurement" },
                  value: "Procurement"
                },
                {
                  text: { type: "plain_text", text: "Revenue / Collaboration" },
                  value: "Revenue / Collaboration"
                },
                {
                  text: { type: "plain_text", text: "Other" },
                  value: "Other"
                }
              ]
            }
          },
          {
            type: "input",
            block_id: "counterparty_block",
            label: {
              type: "plain_text",
              text: "Counterparty"
            },
            element: {
              type: "plain_text_input",
              action_id: "counterparty_input",
              placeholder: {
                type: "plain_text",
                text: "Enter counterparty name"
              }
            }
          },
          {
            type: "input",
            block_id: "description_block",
            label: {
              type: "plain_text",
              text: "Description"
            },
            element: {
              type: "plain_text_input",
              action_id: "description_input",
              multiline: true,
              placeholder: {
                type: "plain_text",
                text: "Briefly describe the request"
              }
            }
          }
        ]
      }
    });
  } catch (error) {
    console.error("❌ Error opening modal:", error);
  }
});

// ===============================
// Modal submission handler
// ===============================
app.view("legal_request_form", async ({ ack, body, view, client }) => {
  await ack();
  try {
    const user = body.user.name;
    const channel = body.channel?.id || process.env.DEFAULT_CHANNEL_ID;
    const requestType = view.state.values.type_block.request_type.selected_option.value;
    const counterparty = view.state.values.counterparty_block.counterparty_input.value;
    const description = view.state.values.description_block.description_input.value;

    // Post a summary message in Slack
    const result = await client.chat.postMessage({
      channel: process.env.LEGAL_CHANNEL_ID || channel,
      text: `🧾 *New Legal Request Submitted by* ${user}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🧾 *New Legal Request Submitted by* ${user}\n\n• *Type:* ${requestType}\n• *Counterparty:* ${counterparty}\n• *Description:* ${description}`
          }
        }
      ]
    });

    const threadTs = result.ts;

    // Send to Apps Script for folder creation, email, Notion logging
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "new_request",
        requestType,
        counterparty,
        description,
        submittedBy: user,
        channel: result.channel,
        thread_ts: threadTs
      })
    });

    // Post confirmation in thread
    await client.chat.postMessage({
      channel: result.channel,
      thread_ts: threadTs,
      text: "✅ Request recorded successfully. Please attach all relevant documents in this thread."
    });

  } catch (error) {
    console.error("❌ Error handling modal submission:", error);
  }
});

// ===============================
// File upload listener (detects attachments in the thread)
// ===============================
app.event("message", async ({ event, client, logger }) => {
  try {
    if (event.subtype !== "file_share") return;
    if (!event.thread_ts) return;

    const file = event.files?.[0];
    if (!file) return;

    // Get downloadable URL
    const info = await client.files.info({ file: file.id });
    const url = info.file.url_private_download;

    // Forward to Apps Script
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "file_upload",
        channel: event.channel,
        thread_ts: event.thread_ts,
        fileName: info.file.name,
        fileUrl: url
      })
    });

    // Confirm upload in Slack
    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.thread_ts,
      text: `📎 File *${file.name}* uploaded and saved successfully.`
    });

  } catch (error) {
    logger.error("❌ File upload handler error:", error);
  }
});

// ===============================
// Express receiver for Slack events
// ===============================
const expressApp = express();
expressApp.use(express.json());
expressApp.post("/slack/events", app.receiver.app);
expressApp.get("/", (req, res) => res.send("AI71 Legal Request Bot is running ✅"));

app.start(process.env.PORT || 3000).then(() => {
  console.log("⚡️ Slack Bolt app is running on port", process.env.PORT || 3000);
});
