const chatForm = document.querySelector("#chat-form");
const messageInput = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const messages = document.querySelector("#messages");
const typingStatus = document.querySelector("#typing-status");
const claimForm = document.querySelector("#claim-form");
const claimSubmit = document.querySelector("#claim-submit");
const claimStatus = document.querySelector("#claim-status");

let conversationId = null;

function addMessage(text, ...classNames) {
  const article = document.createElement("article");
  const paragraph = document.createElement("p");

  article.classList.add("message", ...classNames);
  paragraph.textContent = text;
  article.append(paragraph);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = messageInput.value.trim();
  if (!message || message.length > 2000) {
    messageInput.focus();
    return;
  }

  addMessage(message, "message-user");
  messageInput.value = "";
  sendButton.disabled = true;
  typingStatus.textContent = "Escribiendo…";

  try {
    const result = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
      }),
    });
    const data = await result.json();

    if (!result.ok) {
      throw new Error(data.error || "No fue posible enviar el mensaje.");
    }

    conversationId = data.conversation_id;
    addMessage(data.reply, "message-assistant");
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "No fue posible conectar con el asistente. Intenta de nuevo.";
    addMessage(errorMessage, "message-assistant", "message-error");
  } finally {
    sendButton.disabled = false;
    typingStatus.textContent = "";
    messageInput.focus();
  }
});

claimForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  claimSubmit.disabled = true;
  claimStatus.textContent = "Enviando…";
  const formData = new FormData(claimForm);

  try {
    const response = await fetch("/api/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData)),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "No fue posible registrar el reclamo.");
    }

    claimStatus.textContent = `Reclamo ${result.folio} registrado como ${result.estado}.`;
    claimForm.reset();
  } catch (error) {
    claimStatus.textContent =
      error instanceof Error ? error.message : "Ocurrió un error.";
  } finally {
    claimSubmit.disabled = false;
  }
});
