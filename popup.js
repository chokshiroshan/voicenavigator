// popup.js

document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("start-btn");
  const stopBtn = document.getElementById("stop-btn");
  const saveKeyBtn = document.getElementById("save-key-btn");
  const apiKeyInput = document.getElementById("api-key");
  const status = document.getElementById("status");

  // Load saved API key (for demonstration purposes, in practice, handle securely)
  chrome.storage.sync.get(["openaiApiKey"], (result) => {
    apiKeyInput.value = result.openaiApiKey || process.env.OPENAI_API_KEY;
  });

  saveKeyBtn.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.sync.set({ openaiApiKey: apiKey }, () => {
        alert("API Key saved securely.");
      });
    } else {
      alert("Please enter a valid API Key.");
    }
  });

  startBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ command: "start-listening" });
    status.textContent = "Listening...";
    startBtn.disabled = true;
    stopBtn.disabled = false;
  });

  stopBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ command: "stop-listening" });
    status.textContent = "Stopped.";
    startBtn.disabled = false;
    stopBtn.disabled = true;
  });
});
