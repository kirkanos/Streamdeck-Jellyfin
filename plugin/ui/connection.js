/**
 * Shared "Jellyfin server" section of the property inspectors.
 *
 * The plugin owns the connection: this page sends URL and API key once
 * ({ event: "connect" }); the plugin checks them against /System/Info,
 * stores them in the global settings when they work and reports the status
 * back ({ event: "status" }).
 */
(function () {
  const client = SDPIComponents.streamDeckClient;
  const $ = (id) => document.getElementById(id);

  const STATE_TEXT = {
    connected: "Connected",
    connecting: "Connecting…",
    error: "Connection problem",
    unconfigured: "Not connected",
  };

  function send(payload) {
    client.send("sendToPlugin", payload);
  }

  function showMessage(text, kind) {
    const box = $("jellyfin-message");
    box.textContent = text || "";
    box.className = `message ${kind || ""}`;
    box.hidden = !text;
  }

  function sessionsText(count) {
    return count === 1 ? "1 session playing" : `${count} sessions playing`;
  }

  function renderStatus(status) {
    const badge = $("jellyfin-status");
    badge.className = `status ${status.state}`;
    $("jellyfin-status-text").textContent = STATE_TEXT[status.state] || status.state;
    $("jellyfin-status-detail").textContent = status.error
      ? status.error
      : status.state === "connected"
        ? `${status.serverName || status.url} · ${sessionsText(status.sessionCount)}`
        : status.url;

    $("jellyfin-setup").hidden = status.configured;
    $("jellyfin-disconnect").hidden = !status.configured;
    for (const el of document.querySelectorAll(".requires-connection")) {
      el.hidden = !status.configured;
    }
    if (!status.configured && status.url && !$("jellyfin-url").value) {
      $("jellyfin-url").value = status.url;
    }
  }

  client.sendToPropertyInspector.subscribe((message) => {
    const payload = message.payload || {};
    if (payload.event === "status") {
      renderStatus(payload);
    } else if (payload.event === "connect") {
      $("jellyfin-connect").disabled = false;
      if (payload.ok) {
        showMessage(`Connected to ${payload.serverName}${payload.version ? ` (${payload.version})` : ""}`, "success");
        $("jellyfin-api-key").value = "";
      } else {
        showMessage(payload.error, "error");
      }
    }
  });

  const TEMPLATE = `
    <sdpi-item label="Jellyfin">
      <div id="jellyfin-status" class="status unconfigured">
        <div><strong id="jellyfin-status-text">…</strong><span id="jellyfin-status-detail"></span></div>
      </div>
    </sdpi-item>
    <div id="jellyfin-message" class="message" hidden></div>
    <div id="jellyfin-setup" hidden>
      <sdpi-item label="Server URL"><sdpi-textfield id="jellyfin-url" placeholder="https://jellyfin.example.com"></sdpi-textfield></sdpi-item>
      <sdpi-item label="API key"><sdpi-password id="jellyfin-api-key"></sdpi-password></sdpi-item>
      <sdpi-item><sdpi-button id="jellyfin-connect">Test &amp; connect</sdpi-button></sdpi-item>
      <p class="hint">Create an API key in Jellyfin under Dashboard &gt; API Keys. The key is checked against the server and then stored in the Stream Deck settings.</p>
    </div>
    <div id="jellyfin-disconnect" hidden>
      <sdpi-item><sdpi-button id="jellyfin-disconnect-button">Disconnect</sdpi-button></sdpi-item>
    </div>`;

  window.addEventListener("DOMContentLoaded", () => {
    $("jellyfin-connection").innerHTML = TEMPLATE;

    $("jellyfin-connect").addEventListener("click", () => {
      const url = ($("jellyfin-url").value || "").trim();
      const apiKey = ($("jellyfin-api-key").value || "").trim();
      if (!url || !apiKey) {
        showMessage("Please enter the server URL and an API key", "error");
        return;
      }
      showMessage("Testing…", "");
      $("jellyfin-connect").disabled = true;
      send({ event: "connect", url, apiKey });
    });

    $("jellyfin-disconnect-button").addEventListener("click", () => {
      showMessage("", "");
      send({ event: "disconnect" });
    });

    send({ event: "getStatus" });
  });
})();
