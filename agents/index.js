const Anthropic = require("@anthropic-ai/sdk");
const readline = require("readline");

const client = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (question) =>
  new Promise((resolve) => rl.question(question, resolve));

// ─── הגדרות סוכנים ────────────────────────────────────────────────
const AGENTS = {
  archi: {
    name: "ארכי",
    emoji: "🏗️",
    color: "\x1b[36m", // cyan
    systemPrompt: `אתה ארכי - מתכנן מערכות מומחה. תפקידך לאסוף דרישות מהמשתמש ולבנות מפרט טכני מלא.

הכללים שלך:
1. שאל שאלות ממוקדות אחת בכל פעם - לא יותר מ-3 שאלות ביחד
2. אל תתקדם עד שהבנת לחלוטין את הדרישה
3. כשיש לך מספיק מידע, צור מפרט טכני מובנה בפורמט הזה:

## מפרט טכני - [שם הפרויקט]

### מטרה
[תיאור קצר]

### דרישות פונקציונליות
- [דרישה 1]
- [דרישה 2]

### דרישות טכניות
- שפה/פריימוורק: [...]
- מסד נתונים: [...]
- API: [...]

### מבנה קבצים
[תיאור המבנה]

### נקודות קריטיות
[דברים שחייבים להיות מושלמים]

### מה לא בסקופ
[מה לא כולל]

כשאתה מוכן לסיים, כתוב בדיוק: "SPEC_READY" בשורה נפרדת.`,
  },

  devi: {
    name: "דבי",
    emoji: "💻",
    color: "\x1b[33m", // yellow
    systemPrompt: `אתה דבי - מפתח full-stack מנוסה. תקבל מפרט טכני מארכי ותבנה את המערכת.

הכללים שלך:
1. קרא את המפרט בקפידה לפני שאתה מתחיל
2. כתוב קוד נקי, ברור ומתועד
3. בנה את הקבצים לפי המבנה שהוגדר
4. אחרי שסיימת לכתוב את הקוד, ציין אילו פקודות git להריץ

הפורמט שלך לכל קובץ:
\`\`\`filepath
[שם הקובץ]
\`\`\`
\`\`\`[שפה]
[הקוד]
\`\`\`

בסוף כתוב:
## פקודות Git
\`\`\`bash
[פקודות git לדחיפה]
\`\`\`

כשסיימת לכתוב הכל, כתוב בדיוק: "CODE_READY" בשורה נפרדת.`,
  },

  esti: {
    name: "אסתי",
    emoji: "🔍",
    color: "\x1b[35m", // magenta
    systemPrompt: `אתה אסתי - מהנדסת QA ואבטחת איכות. תקבל מפרט טכני מארכי וקוד מדבי, ותבדקי הכל.

הכללים שלך:
1. השווה כל דרישה במפרט מול הקוד שנכתב
2. חפשי באגים, חורי אבטחה, ובעיות ביצועים
3. בדקי שהקוד עומד ב-best practices

הפורמט שלך:

## דוח בדיקת קוד - אסתי

### ✅ מה עובד כמצופה
- [פריט 1]

### ❌ חוסרים מהמפרט
- [מה חסר]

### 🐛 באגים שנמצאו
- [באג + הסבר]

### ⚠️ אזהרות
- [בעיות פוטנציאליות]

### 💡 המלצות שיפור
- [המלצה]

### 📊 ציון התאמה
[X/10] - [הסבר קצר]

כשסיימת, כתוב בדיוק: "REVIEW_DONE" בשורה נפרדת.`,
  },
};

// ─── פונקציות עזר ────────────────────────────────────────────────
function printAgent(agentKey, message) {
  const agent = AGENTS[agentKey];
  const reset = "\x1b[0m";
  const bold = "\x1b[1m";
  console.log(
    `\n${agent.color}${bold}${agent.emoji} ${agent.name}:${reset}\n${message}\n`
  );
}

function printSeparator(title) {
  const line = "─".repeat(50);
  console.log(`\n\x1b[90m${line}\n  ${title}\n${line}\x1b[0m\n`);
}

async function callClaude(systemPrompt, messages) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });
  return response.content[0].text;
}

// ─── שלב 1: ארכי מתכנן ────────────────────────────────────────────
async function runArchi(initialRequest) {
  printSeparator("שלב 1: ארכי מתכנן את המערכת");

  const messages = [{ role: "user", content: initialRequest }];
  let spec = "";

  while (true) {
    const response = await callClaude(AGENTS.archi.systemPrompt, messages);
    printAgent("archi", response);

    if (response.includes("SPEC_READY")) {
      spec = response.replace("SPEC_READY", "").trim();
      console.log("\x1b[32m✓ ארכי סיים את התכנון!\x1b[0m");
      break;
    }

    messages.push({ role: "assistant", content: response });
    const userInput = await ask("\x1b[36m➤ התשובה שלך: \x1b[0m");
    messages.push({ role: "user", content: userInput });
  }

  return spec;
}

// ─── שלב 2: דבי בונה ─────────────────────────────────────────────
async function runDevi(spec) {
  printSeparator("שלב 2: דבי כותב את הקוד");

  const messages = [
    {
      role: "user",
      content: `קיבלת את המפרט הבא מארכי. אנא בנה את המערכת:\n\n${spec}`,
    },
  ];

  let code = "";

  while (true) {
    const response = await callClaude(AGENTS.devi.systemPrompt, messages);
    printAgent("devi", response);

    if (response.includes("CODE_READY")) {
      code = response.replace("CODE_READY", "").trim();
      console.log("\x1b[32m✓ דבי סיים לכתוב את הקוד!\x1b[0m");
      break;
    }

    messages.push({ role: "assistant", content: response });
    const userInput = await ask(
      "\x1b[33m➤ הערה לדבי (או Enter להמשך): \x1b[0m"
    );
    if (userInput.trim() === "") {
      messages.push({
        role: "user",
        content: "המשך לבנות, אני מאשר את הכיוון.",
      });
    } else {
      messages.push({ role: "user", content: userInput });
    }
  }

  return code;
}

// ─── שלב 3: אסתי בודקת ───────────────────────────────────────────
async function runEsti(spec, code) {
  printSeparator("שלב 3: אסתי בודקת את הכל");

  const messages = [
    {
      role: "user",
      content: `קיבלת לבדיקה:\n\n## המפרט של ארכי:\n${spec}\n\n## הקוד של דבי:\n${code}\n\nאנא בצעי בדיקה מקיפה.`,
    },
  ];

  const response = await callClaude(AGENTS.esti.systemPrompt, messages);
  printAgent("esti", response.replace("REVIEW_DONE", "").trim());
  console.log("\x1b[32m✓ אסתי סיימה את הבדיקה!\x1b[0m");

  return response;
}

// ─── ראשי ────────────────────────────────────────────────────────
async function main() {
  console.log("\x1b[1m\x1b[34m");
  console.log("╔════════════════════════════════════════╗");
  console.log("║     מערכת סוכנים: ארכי, דבי, אסתי     ║");
  console.log("╚════════════════════════════════════════╝");
  console.log("\x1b[0m");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "\x1b[31m❌ חסר ANTHROPIC_API_KEY - הגדר את המשתנה ב-.env\x1b[0m"
    );
    process.exit(1);
  }

  console.log(
    "ספר לי מה אתה רוצה לבנות. ארכי ישאל אותך שאלות, דבי יכתוב את הקוד, ואסתי תבדוק הכל.\n"
  );

  const initialRequest = await ask("\x1b[1m➤ מה תרצה לבנות? \x1b[0m");

  try {
    const spec = await runArchi(initialRequest);
    const code = await runDevi(spec);
    await runEsti(spec, code);

    printSeparator("✅ הפרויקט הושלם!");
    console.log(
      "הסוכנים סיימו את עבודתם. הקוד מוכן לפרסום לפי הוראות דבי.\n"
    );
  } catch (error) {
    console.error("\x1b[31m❌ שגיאה:", error.message, "\x1b[0m");
  } finally {
    rl.close();
  }
}

main();
