require("dotenv").config();

const express = require("express");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");

const pokemonSeries = require("./pokemon-series.json");

const app = express();
const PORT = process.env.PORT || 3000;

// ---- CardSight AI API configuration ----
// Fill these in with your real values (see .env.example).
const CARDSIGHT_API_URL = process.env.CARDSIGHT_API_URL; // e.g. https://api.cardsight.ai/v1/analyze
const CARDSIGHT_API_KEY = process.env.CARDSIGHT_API_KEY; // your API key / token

// ---- Multer setup: keep the uploaded image in memory (no disk writes) ----
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max, adjust as needed
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/**
 * POST /analyze
 * Accepts a multipart/form-data upload with a field named "image",
 * forwards it to the CardSight AI API, and returns the API's response.
 *
 * Example (curl):
 *   curl -F "image=@/path/to/card.jpg" http://localhost:3000/analyze
 */
app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ error: 'No image file provided. Use form field "image".' });
    }

    if (!CARDSIGHT_API_URL || !CARDSIGHT_API_KEY) {
      return res.status(500).json({
        error:
          "Server is not configured. Set CARDSIGHT_API_URL and CARDSIGHT_API_KEY in your .env file.",
      });
    }

    // Build the multipart form to send upstream to CardSight AI.
    // NOTE: adjust the field name ("image" below) and any extra fields
    // to match CardSight AI's actual API contract.
    const form = new FormData();
    form.append("image", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const detectResponse = await axios.post(
      CARDSIGHT_API_URL + "detect/card",
      form,
      {
        headers: {
          ...form.getHeaders(),
          "x-api-key": CARDSIGHT_API_KEY,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      },
    );

    if (!detectResponse.data.detected) {
      throw Error("No card in image");
    }

    const form2 = new FormData();
    form2.append("image", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const identifyResponse = await axios.post(
      CARDSIGHT_API_URL + "identify/card",
      form2,
      {
        headers: {
          ...form.getHeaders(),
          "x-api-key": CARDSIGHT_API_KEY,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      },
    );

    const card = identifyResponse.data.detections[0].card;
    const grading = identifyResponse.data.detections[0].grading;

    const setId = getSetIdByName(pokemonSeries, card.releaseName);

    const imageResponse = await axios.get(
      CARDSIGHT_API_URL + "images/cards/" + card.id,
      {
        params: { format: "json", default: false },
        headers: {
          "x-api-key": CARDSIGHT_API_KEY,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      },
    );

    const imageBase64String = imageResponse.data.data;

    if (!setId) {
      throw Error("Set Id not recognized");
    }

    const rawHoloType =
      card.fields.find(({ key }) => key === "RARITY")?.value.toLowerCase() ??
      "";
    const attributes = card.attributes;

    let holoType = "0";

    if (
      rawHoloType.includes("holo") ||
      attributes.includes("pokemon-holo-rare")
    ) {
      holoType = "2";
    }

    if (
      rawHoloType.includes("illustration") ||
      attributes.includes("pokemon-illustration-rare")
    ) {
      holoType = "5";
    }

    if (rawHoloType.includes("special")) {
      holoType = "6";
    }

    if (
      rawHoloType.includes("hyper") ||
      attributes.includes("pokemon-hyper-rare")
    ) {
      holoType = "7";
    }

    if (
      rawHoloType.includes("shiny") ||
      attributes.includes("pokemon-shiny-rare")
    ) {
      holoType = "8";
    }

    if (
      rawHoloType.includes("rainbow") ||
      rawHoloType.includes("vmax") ||
      rawHoloType.includes("vstar") ||
      attributes.includes("pokemon-vmax") ||
      attributes.includes("pokemon-vstar")
    ) {
      holoType = "9";
    }

    if (rawHoloType.includes("shining")) {
      holoType = "10";
    }

    if (rawHoloType.includes("ace")) {
      holoType = "12";
    }

    const tailoredResponse = {
      card: {
        id: `${getSetIdByName(pokemonSeries, card.releaseName)}-${card.number.toLowerCase()}`,
        type: "0",
        imageBase64String,
        holoType,
        language:
          card.fields.find(({ key }) => key === "CARD_LANGUAGE").value ??
          card.fields.find(({ key }) => key === "LANGUAGE").value,
      },
      ...(!!grading
        ? {
            grading: {
              grader: grading?.company?.name,
              grade: grading?.grade.value ?? grading?.grade?.condition,
            },
          }
        : {}),
    };

    if (tailoredResponse.card.language !== "en") {
      throw Error("Only English Language Cards is supported.");
    }

    // Pass the CardSight AI response straight back to the caller.
    res.status(identifyResponse.status).json(tailoredResponse);
  } catch (err) {
    if (err.response) {
      // CardSight AI responded with an error status
      return res.status(err.response.status).json({
        error: "CardSight AI API request failed",
        details: err.response.data,
      });
    }
    res
      .status(500)
      .json({ error: "Internal server error", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

const getSetIdByName = (data, setName) => {
  for (const series of data.data) {
    const set = series.sets.find((set) => set.name === setName);

    if (set) {
      return set.setId;
    }
  }

  return undefined;
};
