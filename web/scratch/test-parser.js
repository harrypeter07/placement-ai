import { smartPlacementInsights } from "../lib/ai/smart-placement-analysis";

const rawMessages = [
  {
    messageId: "seed_msg_id_18",
    sentAt: "2026-07-15T10:00:00.000Z",
    senderName: "T&P CDPC",
    text: "Dr Parag Jawarkar, Dean-T&P, RCOEM\n\nhttps://stripe.com/jobs/listing/software-engineer-intern/8031833?gh_src=73vnei\n\nStripe , 20LPA\nApply before 17July"
  },
  {
    messageId: "seed_msg_id_17",
    sentAt: "2026-07-14T10:00:00.000Z",
    senderName: "T&P CDPC",
    text: "Adobe University Hackathon 2026 – Registrations Open\n\nDear Students,\nAdobe has launched the Adobe University Hackathon 2026, inviting engineering students from across the country to solve real-world challenges using AI, creativity, and innovation.\n\nRegistration Details:\nRegistration Link: https://unstop.com/p/adobe-university-hackathon-2026-adobe-1715333\n\nLast Date to Register: 8th August 2026\n\nEligibility: Open to all engineering students across all years and branches.\nTeam Size: 2–3 members (from the same college)."
  }
];

const insights = smartPlacementInsights("-1003268872994", "RCOEM CDPC 2027 College level", rawMessages);
console.log("Parsed Insights:", JSON.stringify(insights, null, 2));
