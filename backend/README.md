# AI-DemoProject

## Image generation (LiteLLM proxy)

The assistant can generate images inline. When a user message looks like an
image request (e.g. *"draw a cat astronaut"*, *"generate a picture of …"*),
the chat endpoint calls the image model via **LiteLLM**
(`litellm.aimage_generation`) instead of the regular text path. When
`LITELLM_PROXY_URL` is set, the request is routed through the self-hosted
LiteLLM proxy just like text completions.

The default model is `gemini/imagen-4.0-fast-generate-001` (Google Imagen,
exposed by the Amzur LiteLLM proxy).

### Configuration

In `backend/.env`:

```env
# Optional — override the image model. Default is shown below.
IMAGE_GEN_MODEL=gemini/imagen-4.0-fast-generate-001

# Used to route through the proxy.
LITELLM_PROXY_URL=https://litellm.amzur.com
LITELLM_API_KEY=sk-...

# Only required if you bypass the proxy and call Google directly.
GOOGLE_API_KEY=
```

### Storage & endpoint

Generated images are written to `backend/storage/images/{uuid}.png` and
served by an authenticated endpoint:

```
GET /api/v1/images/{filename}
```

The filename is validated against `^[A-Za-z0-9_\-]{1,64}\.(png|jpg|jpeg|webp)$`
and the request requires a valid session cookie (same auth as `/api/v1/chat`).

The assistant message is persisted in `chat_messages.attachments` (a JSON
column added by migration `b2c3d4e5f6a7`) as:

```json
[{ "kind": "image", "url": "/api/v1/images/<uuid>.png", "mime": "image/png", "prompt": "..." }]
```

### Smoke test

```powershell
cd backend
.\.venv\Scripts\python.exe -m scripts._check_image_gen
```

Writes `backend/scripts/_check_image_gen.png` on success.
