# ESP32 Box API

Toegevoegd voor de Huttendorp ESP32 boxen.

## POST /api/box/check-card

Request:

```json
{
  "postId": "p01",
  "boxId": "box-p01",
  "uid": "04AABBCC"
}
```

Response bij succes:

```json
{
  "ok": true,
  "cardId": "04AABBCC",
  "uid": "04AABBCC",
  "postId": "p01",
  "boxId": "box-p01",
  "teamId": "...",
  "teamName": "Team 1",
  "totalPoints": 0
}
```

## POST /api/box/submit-answer

Request:

```json
{
  "postId": "p01",
  "boxId": "box-p01",
  "uid": "04AABBCC",
  "answer": "R"
}
```

Antwoord mag `R`, `G` of `B` zijn.

Response bij succes:

```json
{
  "ok": true,
  "message": "Antwoord opgeslagen",
  "postId": "p01",
  "uid": "04AABBCC",
  "answer": "R",
  "teamName": "Team 1",
  "questionTitle": "...",
  "isCorrect": true,
  "pointsEarned": 10,
  "totalPoints": 20
}
```

## GET /api/box/status

Geeft simpele serverstatus terug voor testen.
