const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const axios = require("axios");

const app = express();

const {
  IG_APP_ID,
  IG_APP_SECRET,
  BASE_URL,
  SESSION_SECRET,
  REVIEW_USER,
  REVIEW_PASS,
} = process.env;

const requiredEnv = ["IG_APP_ID", "IG_APP_SECRET", "BASE_URL", "SESSION_SECRET"];
const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.warn(`Missing required env vars: ${missing.join(", ")}`);
}

app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET || "dev-session-secret",
    resave: false,
    saveUninitialized: false,
  })
);

const basicAuthMiddleware = (req, res, next) => {
  if (!REVIEW_USER || !REVIEW_PASS) {
    return next();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Basic ")) {
    res.set("WWW-Authenticate", "Basic realm=\"App Review Demo\"");
    return res.status(401).send("Auth required");
  }

  const base64 = header.replace("Basic ", "");
  const [user, pass] = Buffer.from(base64, "base64").toString("utf8").split(":");
  if (user !== REVIEW_USER || pass !== REVIEW_PASS) {
    res.set("WWW-Authenticate", "Basic realm=\"App Review Demo\"");
    return res.status(401).send("Invalid credentials");
  }

  return next();
};

app.use(basicAuthMiddleware);

const ensureConnected = (req, res, next) => {
  if (!req.session.accessToken || !req.session.profile) {
    return res.redirect("/");
  }
  return next();
};

const renderPage = (title, body) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; background: #f6f7fb; }
    .card { background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.08); margin-bottom: 16px; }
    .button { display: inline-block; padding: 10px 14px; border-radius: 8px; text-decoration: none; background: #4f46e5; color: #fff; margin-right: 8px; }
    .button.secondary { background: #0f172a; }
    .label { font-weight: 600; }
    input, select, textarea { width: 100%; padding: 8px; margin-top: 6px; margin-bottom: 12px; }
    form { margin-top: 12px; }
    .muted { color: #6b7280; font-size: 0.9rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;

const IG_API_VERSION = "v19.0"; // o la que uses
const buildGraphUrl = (path) => `https://graph.instagram.com/${IG_API_VERSION}/${path}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForMediaContainer(containerId, accessToken) {
  // ~30s total (15 * 2s). Ajusta si usas videos.
  for (let i = 0; i < 15; i++) {
    const statusResp = await axios.get(buildGraphUrl(containerId), {
      params: { fields: "status_code", access_token: accessToken },
    });

    const status = statusResp.data?.status_code;

    if (status === "FINISHED") return true;
    if (status === "ERROR") {
      throw new Error(`Container status ERROR: ${JSON.stringify(statusResp.data)}`);
    }

    await sleep(2000);
  }

  return false;
}


app.get("/", (req, res) => {
  const profile = req.session.profile;
  const connected = profile ? `Connected as @${profile.username}` : "Not connected";

  const body = `
  <div class="card">
    <p class="label">Status</p>
    <p>${connected}</p>
    <div>
      <a class="button" href="/auth/login">Connect</a>
      <a class="button secondary" href="/publish">Publish</a>
      <a class="button secondary" href="/comments">Comments</a>
    </div>
  </div>
  <div class="card">
    <p class="label">Perfil conectado</p>
    <pre>${profile ? JSON.stringify(profile, null, 2) : "No profile loaded"}</pre>
  </div>
  `;

  res.send(renderPage("Instagram Business Login Review", body));
});

app.get("/auth/login", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.csrfState = state;

  const redirectUri = `${BASE_URL}/auth/callback`;
  const params = new URLSearchParams({
    client_id: IG_APP_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments",
    state,
  });

  const url = `https://www.instagram.com/oauth/authorize?${params.toString()}`;
  res.redirect(url);
});

app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.status(400).send(renderPage("Auth Error", "Missing code"));
  }
  if (state !== req.session.csrfState) {
    return res.status(400).send(renderPage("Auth Error", "Invalid state"));
  }

  try {
    const redirectUri = `${BASE_URL}/auth/callback`;
    const form = new URLSearchParams({
      client_id: IG_APP_ID || "",
      client_secret: IG_APP_SECRET || "",
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code: code.toString(),
    });

    const tokenResponse = await axios.post(
      "https://api.instagram.com/oauth/access_token",
      form,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenResponse.data.access_token;
    req.session.accessToken = accessToken;

    const profileResponse = await axios.get("https://graph.instagram.com/me", {
      params: {
        fields: "id,username",
        access_token: accessToken,
      },
    });

    req.session.profile = profileResponse.data;

    return res.redirect("/");
  } catch (error) {
    const message = error.response?.data ? JSON.stringify(error.response.data, null, 2) : error.message;
    return res
      .status(500)
      .send(renderPage("Auth Error", `<pre>${message}</pre>`));
  }
});

app.get("/publish", ensureConnected, (req, res) => {
  const body = `
  <div class="card">
    <form method="POST" action="/publish">
      <label class="label">Image URL</label>
      <input name="image_url" required placeholder="https://..." />
      <label class="label">Caption</label>
      <textarea name="caption" rows="4" placeholder="Caption..."></textarea>
      <button class="button" type="submit">Publish</button>
    </form>
  </div>
  `;
  res.send(renderPage("Publish Media", body));
});

app.post("/publish", ensureConnected, async (req, res) => {
  const { image_url: imageUrl, caption } = req.body;
  const accessToken = req.session.accessToken;
  const igUserId = req.session.profile.id;

  try {
    const creationResponse = await axios.post(buildGraphUrl(`${igUserId}/media`), null, {
      params: {
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      },
    });

    const creationId = creationResponse.data.id;

    // ✅ Espera a que el container esté listo (evita 9007)
    const ready = await waitForMediaContainer(creationId, accessToken);
    if (!ready) {
      throw new Error("The media is not ready after waiting. Try again in a few seconds.");
    }
    
    const publishResponse = await axios.post(buildGraphUrl(`${igUserId}/media_publish`), null, {
      params: {
        creation_id: creationId,
        access_token: accessToken,
      },
    });


    const body = `
    <div class="card">
      <p>Media publicado correctamente.</p>
      <p><span class="label">Creation ID:</span> ${creationId}</p>
      <p><span class="label">Media ID:</span> ${publishResponse.data.id}</p>
      <a class="button" href="/">Back home</a>
    </div>
    `;

    res.send(renderPage("Publish Success", body));
  } catch (error) {
    const message = error.response?.data ? JSON.stringify(error.response.data, null, 2) : error.message;
    res.status(500).send(renderPage("Publish Error", `<pre>${message}</pre>`));
  }
});

app.get("/comments", ensureConnected, async (req, res) => {
  const accessToken = req.session.accessToken;
  const igUserId = req.session.profile.id;
  const selectedMediaId = req.query.media_id;

  try {
    const mediaResponse = await axios.get(buildGraphUrl(`${igUserId}/media`), {
      params: {
        fields: "id,caption,timestamp",
        limit: 10,
        access_token: accessToken,
      },
    });

    const mediaList = mediaResponse.data.data || [];
    let commentsHtml = "<p class=\"muted\">Select a media to view comments.</p>";

    if (selectedMediaId) {
      const commentsResponse = await axios.get(buildGraphUrl(`${selectedMediaId}/comments`), {
        params: {
          fields: "id,text,username,timestamp",
          access_token: accessToken,
        },
      });
      const comments = commentsResponse.data.data || [];

      commentsHtml = comments.length
        ? `
          <table>
            <thead>
              <tr><th>ID</th><th>User</th><th>Comment</th><th>Timestamp</th></tr>
            </thead>
            <tbody>
              ${comments
                .map(
                  (comment) => `
                    <tr>
                      <td>${comment.id}</td>
                      <td>${comment.username || ""}</td>
                      <td>${comment.text || ""}</td>
                      <td>${comment.timestamp || ""}</td>
                    </tr>
                    <tr>
                      <td colspan="4">
                        <form method="POST" action="/comments/reply">
                          <input type="hidden" name="comment_id" value="${comment.id}" />
                          <label class="label">Reply</label>
                          <input name="message" placeholder="Reply message..." required />
                          <button class="button" type="submit">Reply</button>
                        </form>
                      </td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        `
        : "<p class=\"muted\">No comments for this media.</p>";
    }

    const body = `
    <div class="card">
      <form method="GET" action="/comments">
        <label class="label">Select Media</label>
        <select name="media_id">
          <option value="">-- Choose --</option>
          ${mediaList
            .map(
              (media) => `
                <option value="${media.id}" ${media.id === selectedMediaId ? "selected" : ""}>
                  ${media.id} - ${media.caption ? media.caption.substring(0, 40) : "(no caption)"}
                </option>
              `
            )
            .join("")}
        </select>
        <button class="button" type="submit">Load comments</button>
      </form>
    </div>
    <div class="card">
      ${commentsHtml}
    </div>
    `;

    res.send(renderPage("Comments", body));
  } catch (error) {
    const message = error.response?.data ? JSON.stringify(error.response.data, null, 2) : error.message;
    res.status(500).send(renderPage("Comments Error", `<pre>${message}</pre>`));
  }
});

app.post("/comments/reply", ensureConnected, async (req, res) => {
  const { comment_id: commentId, message } = req.body;
  const accessToken = req.session.accessToken;

  try {
    const replyResponse = await axios.post(buildGraphUrl(`${commentId}/replies`), null, {
      params: {
        message,
        access_token: accessToken,
      },
    });

    const body = `
    <div class="card">
      <p>Reply enviado correctamente.</p>
      <p><span class="label">Reply ID:</span> ${replyResponse.data.id || "OK"}</p>
      <a class="button" href="/comments">Back to comments</a>
    </div>
    `;

    res.send(renderPage("Reply Success", body));
  } catch (error) {
    const message = error.response?.data ? JSON.stringify(error.response.data, null, 2) : error.message;
    res.status(500).send(renderPage("Reply Error", `<pre>${message}</pre>`));
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
