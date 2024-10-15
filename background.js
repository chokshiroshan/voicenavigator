// background.js

chrome.runtime.onInstalled.addListener(() => {
  console.log("VoiceNavigator Extension Installed");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message.command === "start-listening" ||
    message.command === "stop-listening"
  ) {
    console.log("Sender:", sender);
    console.log("Message:", message);

    if (sender.tab && sender.tab.id) {
      // Message from a content script
      chrome.scripting.executeScript(
        {
          target: { tabId: sender.tab.id },
          files: ["contentScript.js"],
        },
        () => {
          // Forward the message to the content script
          chrome.tabs.sendMessage(sender.tab.id, message);
        }
      );
    } else {
      // Message from the popup
      // You might want to specify which tab to act upon

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        console.log("Tabs:", tabs);
        if (tabs[0].id) {
          chrome.scripting.executeScript(
            {
              target: { tabId: tabs[0].id },
              files: ["contentScript.js"],
            },
            () => {
              chrome.tabs.sendMessage(tabs[0].id, message);
            }
          );
        } else {
          console.error("No active tab found.");
        }
      });
    }
  }
});
