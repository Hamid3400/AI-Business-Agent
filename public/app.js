const chatBox = document.getElementById('chat-box');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const suggestionsBox = document.getElementById('suggestions');

// Generate isolated session ID for this browser tab
const sessionId = 'web_session_' + Math.random().toString(36).substring(2, 9);

function appendUserMessage(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'flex gap-4 max-w-3xl ml-auto message-enter flex-row-reverse';
  msgDiv.innerHTML = `
    <div class="h-10 w-10 rounded-full bg-nova-600 border border-nova-500 flex items-center justify-center shrink-0 shadow-lg">
      <i class="fa-solid fa-user text-white text-sm"></i>
    </div>
    <div class="space-y-1 text-right w-full">
      <div class="flex items-center gap-2 justify-end">
        <span class="text-xs text-slate-500">You</span>
        <span class="font-semibold text-sm">Customer</span>
      </div>
      <div class="bg-nova-600 p-4 rounded-2xl rounded-tr-none text-sm text-white leading-relaxed shadow-lg inline-block text-left">
        ${escapeHtml(text)}
      </div>
    </div>
  `;
  chatBox.appendChild(msgDiv);
  scrollToBottom();
}

function appendAiMessage(markdownText) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'flex gap-4 max-w-3xl message-enter';
  
  // Parse markdown (bolding, lists, etc) safely
  const formattedHtml = typeof marked !== 'undefined' ? marked.parse(markdownText) : markdownText;
  
  msgDiv.innerHTML = `
    <div class="h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 shadow-lg">
      <img src="https://api.dicebear.com/7.x/bottts/svg?seed=Nova" alt="AI" class="h-8 w-8 rounded-full">
    </div>
    <div class="space-y-1 w-full">
      <div class="flex items-center gap-2">
        <span class="font-semibold text-sm">Nova AI</span>
        <span class="text-xs text-slate-500">Agent</span>
      </div>
      <div class="glass p-4 rounded-2xl rounded-tl-none text-sm text-slate-200 leading-relaxed shadow-lg border-slate-700/50 prose prose-invert max-w-none">
        ${formattedHtml}
      </div>
    </div>
  `;
  chatBox.appendChild(msgDiv);
  scrollToBottom();
}

function showTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'typing-indicator';
  indicator.className = 'flex gap-4 max-w-3xl message-enter';
  indicator.innerHTML = `
    <div class="h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
      <img src="https://api.dicebear.com/7.x/bottts/svg?seed=Nova" alt="AI" class="h-8 w-8 rounded-full opacity-50 grayscale">
    </div>
    <div class="space-y-1">
      <div class="flex items-center gap-2">
        <span class="font-semibold text-sm text-slate-400">Nova AI</span>
      </div>
      <div class="glass p-4 rounded-2xl rounded-tl-none flex items-center gap-1.5 w-16 h-12 shadow-md border-slate-700/50">
        <div class="w-1.5 h-1.5 rounded-full bg-nova-500 typing-dot"></div>
        <div class="w-1.5 h-1.5 rounded-full bg-nova-500 typing-dot"></div>
        <div class="w-1.5 h-1.5 rounded-full bg-nova-500 typing-dot"></div>
      </div>
    </div>
  `;
  chatBox.appendChild(indicator);
  scrollToBottom();
}

function removeTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.remove();
}

function scrollToBottom() {
  chatBox.scrollTo({
    top: chatBox.scrollHeight,
    behavior: 'smooth'
  });
}

// Bind function directly to window so HTML buttons can find it
window.sendQuickMessage = function(text) {
  if (suggestionsBox) suggestionsBox.style.display = 'none';
  handleSendMessage(text);
};

async function handleSendMessage(messageText) {
  if (!messageText.trim()) return;

  appendUserMessage(messageText);
  userInput.value = '';
  sendBtn.disabled = true;
  if (suggestionsBox) suggestionsBox.style.display = 'none';
  
  showTypingIndicator();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: messageText })
    });

    const data = await response.json();
    removeTypingIndicator();

    if (data.reply) {
      appendAiMessage(data.reply);
    } else {
      appendAiMessage("⚠️ " + (data.error || "Failed to get response."));
    }
  } catch (error) {
    console.error("Chat Error:", error);
    removeTypingIndicator();
    appendAiMessage("⚠️ Network error. Please check your server connection.");
  } finally {
    sendBtn.disabled = false;
    userInput.focus();
  }
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  handleSendMessage(userInput.value);
});

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}