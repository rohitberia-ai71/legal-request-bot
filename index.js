// ===============================
// AI71 Legal Request Bot (Fixed for Render + CommonJS)
// ===============================

const { App, ExpressReceiver } = require("@slack/bolt");
const express = require("express");
const fetch = require("node-fetch");

// -------------------------------
// 1. Initialize a custom receiver
// -------------------------------
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// -------------------------------
// 2. Create Slack Bolt App
// -------------------------------
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver
});

const expressApp = receiver.app; // use Bolt’s internal express app
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

// ===============================
// Slash command: /legal
// ===============================
app.command("/legal", async ({ ack, body, client }) => {
  await ack();
  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "legal_request_form",
        title: { type: "plain_text", text: "New Legal Request" },
        submit: { type: "plain_text", text: "Submit" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: "type_block",
            label: { type: "plain_text", text: "Request Type" },
            element: {
              type: "static_select",
              action_id: "request_type",
              options: [
                { text: { type: "plain_text", text: "Procurement" }, value: "Procurement" },
                { text: { type: "plain_text", text: "Revenue / Collaboration" }, value: "Revenue / Collaboration" },
                { text: { type: "plain_text", text: "Other" }, value: "Other" }
              ]
            }
          },
          {
            type: "input",
            block_id: "counterparty_block",
            label: { type: "plain_text", text: "Counterparty" },
            element: {
              type: "plain_text_input",
              action_id: "counterparty_input"
            }
          },
          {
            type: "input",
            block_id: "description_block",
            label: { type: "plain_text", text: "Description" },
            element: {
              type: "plain_text_input",
              action_id: "description_input",
              multiline: true
            }
          }
        ]
      }
    });
  } catch (err) {
    console.error("❌ Error opening modal:", err);
  }
});

// ===============================
// Modal submission handler
// ===============================
app.view("legal_request_form", async ({ ack, body, view, client }) => {
  await ack();
  try {
    const user = body.user.name;
    const requestType = view.state.values.type_block.request_type.selected_option.value;
    const counterparty = view.state.values.counterparty_block.counterparty_input.value;
    const description = view.state.values.description_block.description_input.value;

    const post = await client.chat.postMessage({
      channel: process.env.LEGAL_CHANNEL_ID,
      text: `🧾 *New Legal Request Submitted by* ${user}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🧾 *New Legal Request Submitted by* ${user}\n• *Type:* ${requestType}\n• *Counterparty:* ${counterparty}\n• *Description:* ${description}`
          }
        }
      ]
    });

    const threadTs = post.ts;

    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "new_request",
        requestType,
        counterparty,
        description,
        submittedBy: user,
        channel: post.channel,
        thread_ts: threadTs
      })
    });

    await client.chat.postMessage({
      channel: post.channel,
      thread_ts: threadTs,
      text: "✅ Request recorded. Please upload related files in this thread."
    });
  } catch (err) {
    console.error("❌ Error submitting request:", err);
  }
});

// ===============================
// File upload event handler
// ===============================
app.event("message", async ({ event, client }) => {
  try {
    if (event.subtype !== "file_share" || !event.thread_ts) return;

    const file = event.files?.[0];
    if (!file) return;

    const info = await client.files.info({ file: file.id });
    const url = info.file.url_private_download;

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

    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.thread_ts,
      text: `📎 File *${file.name}* uploaded successfully.`
    });
  } catch (err) {
    console.error("❌ File upload handler error:", err);
  }
});

// ===============================
// Health check endpoint for Render
// ===============================
expressApp.get("/", (req, res) => res.send("✅ AI71 Legal Request Bot is live"));

// ===============================
// Start server
// ===============================
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡️ AI71 Legal Request Bot running on port", process.env.PORT || 3000);
})();
