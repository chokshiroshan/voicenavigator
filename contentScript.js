let recognition;
let isListening = false;
let elements = [];

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === "start-listening") {
    startListening();
  } else if (message.command === "stop-listening") {
    stopListening();
  }
});

function startListening() {
  if (isListening) return;
  isListening = true;

  recognition = new (window.SpeechRecognition ||
    window.webkitSpeechRecognition)();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = async (event) => {
    const transcript =
      event.results[event.results.length - 1][0].transcript.trim();
    console.log("Heard:", transcript);
    await handleUserCommand(transcript);
  };

  recognition.onend = () => {
    if (isListening) {
      recognition.start();
    }
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
  };

  recognition.start();
  extractElements();
}

function stopListening() {
  if (!isListening) return;
  isListening = false;
  recognition.stop();
}

function extractElements() {
  const actionableElements = document.querySelectorAll(
    'a, button, input, select, textarea, [role="button"], [onclick]'
  );
  actionableElements.forEach((el, index) => {
    const bounding = el.getBoundingClientRect();
    if (bounding.width > 0 && bounding.height > 0) {
      elements.push({
        index,
        element: el,
        text: (
          el.innerText ||
          el.value ||
          el.getAttribute("aria-label") ||
          el.getAttribute("alt") ||
          ""
        ).trim(),
        tagName: el.tagName.toLowerCase(),
        attributes: {
          id: el.id,
          classes: el.className,
          name: el.getAttribute("name"),
          type: el.getAttribute("type"),
          placeholder: el.getAttribute("placeholder"),
          title: el.getAttribute("title"),
        },
      });
    }
  });
}

// Observe DOM changes to update elements
const observer = new MutationObserver(() => {
  extractElements();
});
observer.observe(document.body, { childList: true, subtree: true });

// Handle user commands and NLU
async function handleUserCommand(command) {
  console.log("Command:", command);
  extractElements();
  console.log("Elements:", elements);
  const prompt = await generatePrompt(command, elements);
  const response = await getLLMResponse(prompt);
  const actions = parseLLMResponse(response);
  console.log("Prompt:", prompt);
  console.log("Response:", response);
  console.log("Parsed Response:", actions);

  if (actions && actions.length > 0) {
    for (const action of actions) {
      const { targetIndex, actionType, textToInput } = action;
      if (targetIndex && actionType) {
        const targetElement = elements[targetIndex].element;
        if (targetElement) {
          await performAction(targetElement, actionType, textToInput);
        }
      }
    }
  } else {
    alert("Sorry, I could not understand your command.");
  }
}

async function generatePrompt(command, elements) {
  const structureDescription = JSON.stringify(elements);

  return `
User Command: "${command}"

Page Structure:
    ${structureDescription}

Instructions:
- Analyze the page structure and the user's command.
- Identify the actions needed to fulfill the user's intent.
- For each action, provide:
  1. "targetPath": The CSS selector path to the target element
  2. "actionType": The action to perform ("click", "input", "submit", or "scroll")
  3. "textToInput": Any text to input (for "input" actions)
- Respond with a JSON array of actions, without any additional text:
[
  {"targetIndex": "index1", "actionType": "actionType1", "textToInput": "textToInput1"},
  {"targetIndex": "index2", "actionType": "actionType2", "textToInput": "textToInput2"}
]
`;
}

async function getLLMResponse(prompt) {
  const apiKey = await getApiKey();

  if (!apiKey) {
    alert("OpenAI API key is not set.");
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        n: 1,
        stop: null,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error fetching LLM response:", error);
    return null;
  }
}

function parseLLMResponse(response) {
  try {
    return JSON.parse(response);
  } catch (e) {
    console.error("Failed to parse LLM response:", e);
    return null;
  }
}

async function performAction(targetElementData, actionType, textToInput) {
  const el = targetElementData;
  console.log("Performing action:", actionType, "on element:", el);
  switch (actionType.toLowerCase()) {
    case "click":
      await scrollIntoView(el);
      simulateClick(el);
      break;

    case "input":
      if (textToInput !== null) {
        el.focus();
        el.value = textToInput;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      break;

    case "submit":
      if (el.form) {
        el.form.submit();
      } else {
        simulateClick(el);
      }
      break;

    case "scroll":
      await scrollIntoView(el);
      break;

    default:
      console.warn(`Action "${actionType}" is not supported.`);
  }
}

function scrollIntoView(element) {
  return new Promise((resolve) => {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(resolve, 500);
  });
}

function simulateClick(element) {
  const event = new MouseEvent("click", {
    view: window,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
}

function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["openaiApiKey"], (result) => {
      resolve(result.openaiApiKey);
    });
  });
}
