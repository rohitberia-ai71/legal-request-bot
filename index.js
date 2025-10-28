const { App } = require("@slack/bolt");
const fetch = require("node-fetch");

// These will come from Render as environment variables
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,          // from Slack
  signingSecret: process.env.SLACK_SIGNING_SECRET, // from Slack
  port: process.env.PORT || 3000
});

// Slash command to open a modal: /legal
app.command("/legal", async ({ ack, body, client }) => {
  await ack(); // tell Slack we received the command
  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: "modal",
      callback_id: "legal_request",
      title: { type: "plain_text", text: "Legal Request" },
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
              { text: { type: "plain_text", text: "Revenue & Collaboration" }, value: "Revenue & Collaboration" },
              { text: { type: "plain_text", text: "Other" }, value: "Other" }
            ]
          }
        },
        {
          type: "input",
          block_id: "counterparty_block",
          label: { type: "plain_text", text: "Counterparty Name" },
          element: { type: "plain_text_input", action_id: "counterparty" }
        },
        {
          type: "input",
          block_id: "desc_block",
          label: { type: "plain_text", text: "Description" },
          element: { type: "plain_text_input", action_id: "description", multiline: true }
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: "You can attach documents in the Slack thread after submission." }
        }
      ]
    }
  });
});

// Modal submission handler
app.view("legal_request", async ({ ack, view, body, client }) => {
  await ack();

  const userId = body.user.id;
  const userInfo = await client.users.info({ user: userId });
  const userName = userInfo.user?.profile?.real_name || userId;

  const requestType = view.state.values.type_block.request_type.selected_option.value;
  const counterparty = view.state.values.counterparty_block.counterparty.value;
  const description = view.state.values.desc_block.description.value;

  // Optional: call your Apps Script to create a Drive folder and get link back
  // If you have APPS_SCRIPT_URL set in Render, this will try to call it
  let folderUrl = "(folder link will appear here if Apps Script is connected)";
  try {
    if (process.env.APPS_SCRIPT_URL) {
      const r = await fetch(process.env.APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestor: userName,
          request_type: requestType,
          counterparty: counterparty,
          description: description
        })
      });
      const data = await r.json().catch(() => ({}));
      if (data.folderUrl) folderUrl = data.folderUrl;
    }
  } catch (e) {
    // ignore for now
  }

  await client.chat.postMessage({
    channel: "#legal-intake", // change to your real channel
    text:
      `✅ New Legal Request by ${userName}\n` +
      `• Type: ${requestType}\n` +
      `• Counterparty: ${counterparty}\n` +
      `• Description: ${description}\n` +
      `📂 Folder: ${folderUrl}\n\n` +
      `Please upload any supporting documents in this thread.`
  });
});

(async () => {
  await app.start();
  console.log("Slack app is running");
})();
