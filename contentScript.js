// contentScript.js

let recognition;
let isListening = false;
let elements = [];
let pageStructure = {};

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
  extractPageStructure();
}

function stopListening() {
  if (!isListening) return;
  isListening = false;
  recognition.stop();
}

function extractPageStructure() {
  pageStructure = createNodeStructure(document.body);
}

function createNodeStructure(node, depth = 0) {
  if (depth > 10) return null; // Limit depth to prevent infinite recursion

  let structure = {
    tag: node.tagName.toLowerCase(),
    id: node.id,
    classes: Array.from(node.classList),
    text: node.textContent.trim(),
    children: [],
    actionable: isActionable(node),
  };

  if (structure.actionable) {
    structure.index = elements.length;
    elements.push({
      index: elements.length,
      element: node,
      text: structure.text,
      tagName: structure.tag,
      attributes: {
        id: structure.id,
        classes: structure.classes.join(" "),
        name: node.getAttribute("name"),
        type: node.getAttribute("type"),
        placeholder: node.getAttribute("placeholder"),
        title: node.getAttribute("title"),
      },
    });
  }

  for (let child of node.children) {
    const childStructure = createNodeStructure(child, depth + 1);
    if (childStructure) {
      structure.children.push(childStructure);
    }
  }

  return structure;
}

function isActionable(node) {
  const actionableTags = ["a", "button", "input", "select", "textarea"];
  return (
    actionableTags.includes(node.tagName.toLowerCase()) ||
    node.getAttribute("role") === "button" ||
    node.hasAttribute("onclick")
  );
}

// Observe DOM changes to update elements
const observer = new MutationObserver(() => {
  extractPageStructure();
});
observer.observe(document.body, { childList: true, subtree: true });

// Handle user commands and NLU
async function handleUserCommand(command) {
  console.log("Command:", command);
  extractPageStructure();
  console.log("Page Structure:", pageStructure);
  const prompt = await generatePrompt(command, pageStructure);
  const response = await getLLMResponse(prompt);
  const actions = parseLLMResponse(response);
  console.log("Prompt:", prompt);
  console.log("Response:", response);
  console.log("Parsed Response:", actions);

  if (actions && actions.length > 0) {
    for (const action of actions) {
      const { targetPath, actionType, textToInput } = action;
      if (targetPath && actionType) {
        const targetElement = document.querySelector(targetPath);
        if (targetElement) {
          await performAction(
            { element: targetElement },
            actionType,
            textToInput
          );
        }
      }
    }
  } else {
    alert("Sorry, I could not understand your command.");
  }
}

async function generatePrompt(command, pageStructure) {
  const structureDescription = JSON.stringify(pageStructure, null, 2);

  return `
User Command: "${command}"

Page Structure:
${structureDescription}

Instructions:
- Analyze the page structure and the user's command.
- Identify the sequence of actions needed to fulfill the user's intent, considering the hierarchical structure of the page.
- For each action, provide the path to the target element (e.g., "body > div.container > button.submit"), the action to perform (e.g., "click", "input", "scroll"), and any necessary input text.
- Provide the answer as a JSON array of actions without any additional text:
[
  {"targetPath": "path1", "actionType": "actionType1", "textToInput": "textToInput1"},
  {"targetPath": "path2", "actionType": "actionType2", "textToInput": "textToInput2"},
  ...
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
        max_tokens: 150,
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
  const el = targetElementData.element;

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
