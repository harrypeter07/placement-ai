const { GoogleGenerativeAI } = require("@google/generative-ai");

async function main() {
  try {
    const genAI = new GoogleGenerativeAI("AIzaSyAcKrjJcIze34I8njsnopvN4s1w8uFTnyA");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const res = await model.generateContent("Hello, respond with 'OK'");
    console.log("Response:", res.response.text());
  } catch (err) {
    console.error("Error:", err);
  }
}
main();
