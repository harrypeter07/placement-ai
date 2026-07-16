const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://oybdgtsrlkqiishkpncf.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95YmRndHNybGtxaWlzaGtwbmNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzgwMDU3MiwiZXhwIjoyMDk5Mzc2NTcyfQ.ijDqKytcRhkmm8QgwfAfmyjBq6SL0L54ivc4wO7zEq8";

const supabase = createClient(supabaseUrl, supabaseKey);

const groupId = "-1003268872994";
const groupTitle = "RCOEM CDPC 2027 College level";

const rawMessages = [
  {
    date: "2026-06-24T11:00:00.000Z",
    text: "📢 Attention Students (Pre-Final Year – Batch 2027)\n\nYou are hereby informed to attend the *Pratibha Excellence Awards Launch & Thought Exchange* session as per the details below:\n\n🗓 Date: Wednesday, 24 June 2026\n⏰ Time:11:00 AM – 1:00 PM\n\nAgenda:\n• Eaton Overview (20 mins)\n• Thought Exchange (45 mins + 15 mins Q&A)\n• Launch of Pratibha Excellence Award 2026 (20 mins)\n\n🎯 Eligibility:BE/BTech Pre-Final Year (All Specializations, Passing Year 2027)\n\n💻 Online Mode (Microsoft Teams):\nhttps://teams.microsoft.com/meet/267361390151277?p=IoGNRanOhm8zlCyjEq\n\n🆔 Meeting ID: 267 361 390 151 277\n🔐 Passcode: xL3SN2Bs\n\n⚠️ Attendance is mandatory for all eligible students.\nKindly ensure that you join the session at least 5 minutes prior to the scheduled time."
  },
  {
    date: "2026-06-23T13:00:00.000Z",
    text: "Dear Students,\n\nPlease note that the TCS Document Submission email received today is only for document verification purposes. It is NOT an Offer Letter Acceptance email.\nAs communicated by the TCS team, students are required to submit the requested documents within the stipulated timeline. After successful verification, TCS will release the respective Offer Letters, mentioning the offered role (Ninja / Digital / Prime).\n\nStudents will have the opportunity to review the offer details and decide whether to accept or reject the offer only after the Offer Letter is issued.\n\nAlso, please note that the document submission deadline has been extended by 1 hour.\nRevised Deadline: 1:00 PM Today\n\nAll concerned students are advised to complete the document submission process before the revised deadline."
  },
  {
    date: "2026-06-24T10:00:00.000Z",
    text: "Josh Technology Group | Associate Software Developer (Internship + Full-Time) | 2027 Batch\n\nDear Students,\nThe CDPC is pleased to announce the hiring drive of Josh Technology Group for the 2027 Batch.\n\nPosition: Associate Software Developer (12-Month Internship + Full-Time)\n\nEligibility: B.Tech (CS/IT/ECE/ENCS), MCA, M.Tech (CS/IT), M.Sc (CS) – 2027 Batch\n\nInternship Details:\n• Duration: 12 Months\n• Stipend: ₹27,500/month\n• Work Location: Gurugram (Work from Office)\n\nFull-Time CTC: Up to ₹12.70 LPA (including performance-based bonuses)\n\nInterested and eligible students are requested to read the attached JD carefully and complete the registration form before the deadline.\n\nRegistration Form: https://forms.gle/8oVkQ11weLWsSkZa7\n\nRegistration Deadline: 9:00 AM, 27-06-2026\nNote: During registration, you will be required to select your preferred programming language (Java, Python, or JavaScript) for the online assessment. Please register only if you are genuinely interested in the opportunity."
  },
  {
    date: "2026-06-26T12:00:00.000Z",
    text: "Sujeeta Barua\n\nMYNTRA\n\n⏳ Registrations for #WeForShe Hackerramp 2026, Myntra’s flagship women-in-tech team challenge, have been extended by 24 hours.\n\nHere is what awaits:\n- Rewards worth up to ₹5,25,000 (cash prizes + Myntra EGVs)\n- Internship and Pre-Placement Interview (PPI) opportunities with Myntra\n- Digital participation certificates and exciting surprises\n- A fully sponsored trip to the Myntra office to present your ideas to Myntra leaders\n\n🔗 Register Now: https://lnkd.in/dDaRwcPd\n⏰ Final deadline: Tomorrow 02.07.2026, 3 PM\n\nWe are proud to be the official Hackathon Partner backing the women who will define the future of fashion, technology, and Bharat."
  },
  {
    date: "2026-07-01T09:00:00.000Z",
    text: "Sujeeta Barua\n\nTally Code Brewers 2026\n\nWe are pleased to invite your students to participate in Tally Code Brewers 2026: Brew Code | Build Impact, a national coding hackathon by Tally Solutions. The hackathon provides students with an opportunity to solve real-world challenges, showcase their coding skills, and compete with talented peers from across the country.\n\n🔗 Registration Link: https://internshala.com/tally-codebrewers?utm_source=calll&utm_medium=aksh\n📅 Registration Deadline: 2nd July 2026"
  },
  {
    date: "2026-07-01T10:00:00.000Z",
    text: "Sujeeta Barua\n\nCareers of the Future Hackathon - UNSTOP\n\nKey highlights:\n• Guaranteed internship opportunities for winners with leading organizations, including Dabur, Ogilvy, Swish, Bhanzu, Vedantu, Astrotalk, etc.\n• ₹5 Lakh total prize pool.\n• Opportunity to present before Kusha Kapila, Parul Gulati, mentors, judges, and industry leaders.\n• Gain exposure to Aman Gupta's OffBeat.\n• Work on real industry challenges across AI, Entrepreneurship, Marketing, Content Creation, D2C, Quick Commerce, and more.\n• Build portfolio-worthy projects and gain valuable industry exposure.\n\nEvent Details\nDate: 4th & 5th July 2026\nVenue: LIT School, Bangalore\nAge Group: 17–21 years"
  },
  {
    date: "2026-07-01T11:00:00.000Z",
    text: "Sujeeta Barua\n\nIBM SkillsBuild India Hackathon 2026 🚀,\n\nA national-level AI innovation challenge designed to empower students to learn, collaborate, and build real-world AI solutions. We invite you to encourage your students to participate and benefit from this unique learning experience.\n\n📅 Duration: 15 July 2026 – 20 September 2026\n🌏 Participation: Pan-India (Free Program)\n\n👥 Team Guidelines:\n• Up to 5 teams per college\n• 5 students per team\n\n🔘 Register Now\n👉 Click Here to Register"
  },
  {
    date: "2026-07-02T10:00:00.000Z",
    text: "Dr Parag Jawarkar, Dean-T&P, RCOEM\n\nInfosys Phase 2 -\nFrom our side, we share the complete student database for review and analysis. Once company identify suitable profiles, HR may directly email the shortlisted students to initiate and proceed with the recruitment process."
  },
  {
    date: "2026-07-06T09:30:00.000Z",
    text: "Dr Parag Jawarkar, Dean-T&P, RCOEM\n\nStryker for Bio Medical (9LPA)\nDate : 8 July 2026, Main Audi at 9.30 am aprox\nPPT for 2027 and 2028 batch , with QA Session\nSmall Group Discussion and Personal Interview : 2027 Batch"
  },
  {
    date: "2026-07-07T12:00:00.000Z",
    text: "Dr Parag Jawarkar, Dean-T&P, RCOEM\n\nSalesforce : Associate Technical Support Engineer\nhttps://salesforce.wd12.myworkdayjobs.com/External_Career_Site/job/India---Bangalore/Associate-Technical-Support-Engineer_JR350727\nApply before 8pm, 09/07/2026"
  },
  {
    date: "2026-07-08T10:00:00.000Z",
    text: "Dear Students (2027 Batch),\n\nThe Placement Policy for the 2027 Batch is being shared herewith. All students are requested to read the policy carefully, sign the declaration, and get the front page of the policy verified and signed by their Departmental Placement Coordinator.\n\nThe duly signed hard copy must then be submitted to the Departmental Placement Coordinator on or before 10-07-2026."
  },
  {
    date: "2026-07-09T09:00:00.000Z",
    text: "Dr Parag Jawarkar, Dean-T&P, RCOEM\n\nNutanix 2027\nIntern Stipend : INR 50,000 per month\nOn-Call Stipend : INR 150,000 per annum\nTotal Annual Comp : (Excludes Benefits) INR 20,35,000 per annum\nTotal CTC : (Excludes Benefits) INR 31,15,000\nIn campus interview dates: 18th and 19th July, 2026.\nInterview Format: PPT, Online Test, Group Discussions, Tech Interviews, Manager Round\nDuration: 6 Months\nLocation: Bangalore/Pune\nCGPA cutoff: 7.5 and above with no active backlogs.\napply before 11 July 2026\nhttps://docs.google.com/forms/d/e/1FAIpQLSd5i3sF1THwr2EH77T9F_hZRb-0uGSntX6PFOztXolJxxpl8Q/viewform"
  },
  {
    date: "2026-07-10T11:00:00.000Z",
    text: "Varroc Campus Recruitment Drive | GET | Batch 2027\n\nCTC: ₹12.5 LPA (₹9.5 LPA Fixed + ₹3 Lakhs Joining Bonus)\nEligible Branches: Mechanical, Electronics, ECS, CS/IT, Electrical\nEligibility:\n• 10th – 85%+\n• 12th – 70%+\n• UG – 70%+ throughout\n• No academic Backlog (No dead/ No live)\n\nSelection Process\n• Online Assessment: 16 July 2026 | 6:00 PM – 7:30 PM\n• Offline Campus Process: 20 July 2026 (In Campus)\n\nForm Link : https://forms.gle/qc1Ev7xfzTDFxtjU9\nForm Deadline : 11-07-2026, 5 pm"
  },
  {
    date: "2026-07-11T12:00:00.000Z",
    text: "Aspect Ratio Recruitment Drive – Registration Open\n\nRole: Analyst (Analytics)\nEligibility:\nBranches: ECS, CSE/IT, ECE\n10th: 65%+\n12th: 65%+\nUG: 8.0+ CGPA\nNo live or dead backlogs\n\nSelection Process:\nWritten Test: 27th July\nIn-Person Interviews: 29th July\n\nRegistration Deadline: 3:00 PM, 12th July 2026 (Tomorrow)\n\nRegister Here: https://forms.gle/vhisiivspms7NTuk8"
  },
  {
    date: "2026-07-11T15:00:00.000Z",
    text: "Flipkart GRiD 8.0 | Engineering Challenge\n\nDear Students,\nFlipkart GRiD 8.0 is one of India's premier engineering competitions and an excellent opportunity to benchmark your skills against top talent nationwide.\n\nEligibility: 2027 & 2028 Batches\nTracks: Software Development | AI Engineering | Data Science\n\nOpportunities:\n• Internship Interviews\n• Full-Time SDE Interviews\n\nRegistration Link: https://mycareernet.co/events/flipkart-earlycareers-grid-8-0/\nDeadline: 12 July 2026, 11:59 PM"
  },
  {
    date: "2026-07-12T10:00:00.000Z",
    text: "Dear Students,\n\nRegistrations for Tata Technologies InnoVent-27 are now open.\nEligibility: 2027 & 2028 Batch Engineering Students\nTeam Size: 1–5 Members | Registration: Free\nDeadline: 20th July 2026\n\nBenefits: Cash prizes up to ₹4.5 Lakhs, Tata Technologies job opportunities, CLAD Certification, AWS access, industry mentorship, and a national-level project showcase.\n\nRegistration & Project Submission: https://www.tatatechnologies.com/in/innovent/"
  },
  {
    date: "2026-07-13T10:00:00.000Z",
    text: "Dear Students,\n\nRegistrations are now open for the Women Who Master 2026 National Hackathon by Aspire For Her & Logitech.\nEligibility: Female Undergraduate & Postgraduate Students, and Recent Graduates (18+)\n\nBenefits: Cash prizes worth ₹2.25 Lakhs, placement & interview opportunities with Logitech, mentorship from industry leaders, certificates for participants, merit certificates.\n\nRegistration: https://tinyurl.com/4pppxdhm\nRegistration Deadline: 21st July 2026"
  },
  {
    date: "2026-07-14T10:00:00.000Z",
    text: "Adobe University Hackathon 2026 – Registrations Open\n\nDear Students,\nAdobe has launched the Adobe University Hackathon 2026, inviting engineering students from across the country to solve real-world challenges using AI, creativity, and innovation.\n\nRegistration Details:\nRegistration Link: https://unstop.com/p/adobe-university-hackathon-2026-adobe-1715333\n\nLast Date to Register: 8th August 2026\n\nEligibility: Open to all engineering students across all years and branches.\nTeam Size: 2–3 members (from the same college)."
  },
  {
    date: "2026-07-15T10:00:00.000Z",
    text: "Dr Parag Jawarkar, Dean-T&P, RCOEM\n\nhttps://stripe.com/jobs/listing/software-engineer-intern/8031833?gh_src=73vnei\n\nStripe , 20LPA\nApply before 17July"
  }
];

async function run() {
  console.log("Cleaning up bad deadlines and reminders...");
  
  // Delete mock deadlines with bad/empty/wrong names
  const { error: dlDelError } = await supabase
    .from("deadlines")
    .delete()
    .eq("user_id", "613aaafd-2af6-4177-aef6-305196afcede")
    .or("company.eq.and,company.eq.and previous recruitment patterns,company.eq.Placement update");

  if (dlDelError) console.error("Error deleting deadlines:", dlDelError);

  console.log("Seeding Telegram messages...");
  
  for (let i = 0; i < rawMessages.length; i++) {
    const msg = rawMessages[i];
    const payload = {
      group_id: groupId,
      group_title: groupTitle,
      message_id: `seed_msg_id_${i}`,
      text: msg.text,
      sender_name: "T&P CDPC",
      sent_at: msg.date,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from("telegram_messages")
      .upsert([payload], { onConflict: "group_id, message_id" });

    if (error) {
      console.error(`Failed seeding message ${i}:`, error);
    } else {
      console.log(`Seeded message ${i} - sent at ${msg.date}`);
    }
  }

  console.log("Done seeding placement messages!");
}

run();
