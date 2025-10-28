const { App } = require("@slack/bolt");
const fetch = require("node-fetch");


// --------------  CONFIG --------------
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  port: process.env.PORT || 3000
});

// --------------  SLASH COMMAND HANDLER --------------
app.command("/legal", async ({ ack, body, client, logger }) => {
  try {
    await ack();

    // Open modal
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "legal_request_form",
        title: { type: "plain_text", text: "Legal Request" },
        submit: { type: "plain_text", text: "Submit" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: "request_type_block",
            label: { type: "plain_text", text: "Request Type" },
            element: {
              type: "static_select",
              action_id: "request_type",
              placeholder: { type: "plain_text", text: "Pick an option" },
              options: [
                {
                  text: { type: "plain_text", text: "Procurement" },
                  value: "procurement"
                },
                {
                  text: { type: "plain_text", text: "Revenue / Collaboration" },
                  value: "revenue"
                },
                {
                  text: { type: "plain_text", text: "Other" },
                  value: "other"
                }
              ]
            }
          },
          {
            type: "input",
            block_id: "counterparty_block",
            label: { type: "plain_text", text: "Counterparty Name" },
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
              multiline: true,
              action_id: "description_input"
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "You can attach documents in the Slack thread after submission."
            }
          }
        ]
      }
    });
  } catch (error) {
    logger.error(error);
  }
});

// --------------  VIEW SUBMISSION HANDLER --------------
app.view("legal_request_form", async ({ ack, body, view, client, logger }) => {
  try {
    // ✅ Step 1: Acknowledge immediately so Slack doesn't timeout
    await ack();

    // ✅ Step 2: Extract form data safely
    const user = body.user.name;
    const requestType =
      view.state.values.request_type_block.request_type.selected_option?.value || "not selected";
    const counterparty =
      view.state.values.counterparty_block.counterparty_input?.value || "N/A";
    const description =
      view.state.values.description_block.description_input?.value || "N/A";

    // ✅ Step 3: Post confirmation to Slack
    await client.chat.postMessage({
      channel: "#legal-intake", // change if needed
      text: `📥 *New Legal Request Submitted*\n• *Type:* ${requestType}\n• *Counterparty:* ${counterparty}\n• *Description:* ${description}\n• *Submitted by:* ${user}`,
    });

    // ✅ Step 4: Run async webhook *without blocking*
    (async () => {
      try {
        if (process.env.APPS_SCRIPT_URL) {
          const fetch = (await import("node-fetch")).default;
          await fetch(process.env.APPS_SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestType,
              counterparty,
              description,
              user,
              timestamp: new Date().toISOString(),
            }),
          });
        } else {
          logger.info("No APPS_SCRIPT_URL set; skipping webhook.");
        }
      } catch (err) {
        logger.error("Webhook call failed:", err);
      }
    })();

  } catch (error) {
    logger.error("Submission error:", error);
  }
});


// --------------  START APP --------------
(async () => {
  await app.start();
  console.log("⚡️ Legal Request Bot is running!");
})();
