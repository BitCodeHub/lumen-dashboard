# How to Upload Luna's Knowledge Base to ElevenLabs

## What Was Built

Created **6 comprehensive knowledge base documents** for Luna (+ README):

1. **01-COMPANY-OVERVIEW.md** (2.9KB)
   - Company mission, leadership, current focus
   - Business model, target markets, culture

2. **02-TEAM-DIRECTORY.md** (5.3KB)
   - All 21 team members (4 leadership + 17 agents)
   - Organizational structure, routing guide

3. **03-AGENTSHIELD-PRODUCT.md** (5.9KB)
   - Complete AgentShield product info
   - Features, pricing, competitive advantages
   - Common questions and answers

4. **04-COMMON-PROCEDURES.md** (8.1KB)
   - Phone call handling protocols
   - Message taking, scheduling, coordination
   - Escalation procedures, security rules

5. **05-FREQUENTLY-ASKED-QUESTIONS.md** (8.7KB)
   - 40+ FAQs covering company, product, agents
   - Proper responses for common scenarios
   - Deflection templates for sensitive topics

6. **06-CONTACT-INFORMATION.md** (6.4KB)
   - Leadership and team contact details
   - Routing guide, escalation paths
   - Communication preferences

**Total size:** ~43KB (~12,000 tokens)

---

## Upload to ElevenLabs

### Step 1: Access Knowledge Base Settings

1. Go to: https://elevenlabs.io/app/agents
2. Select Luna's agent
3. Click "Knowledge Base" tab

### Step 2: Upload Files

**Upload all 6 documents (01-06):**
- 01-COMPANY-OVERVIEW.md
- 02-TEAM-DIRECTORY.md
- 03-AGENTSHIELD-PRODUCT.md
- 04-COMMON-PROCEDURES.md
- 05-FREQUENTLY-ASKED-QUESTIONS.md
- 06-CONTACT-INFORMATION.md

**DO NOT upload:**
- README.md (instructions, not reference material)
- UPLOAD-INSTRUCTIONS.md (this file)

### Step 3: Enable RAG

- Toggle "Retrieval Augmented Generation (RAG)" ON
- This allows Luna to search and cite specific facts during calls

### Step 4: Configure Settings (if available)

**Chunk size:** Default or 512 tokens
**Retrieval method:** Semantic search
**Max results:** 3-5 chunks per query

---

## What Luna Can Now Do

With this knowledge base, Luna can:

✅ **Answer company questions accurately**
- "What does Lumen AI do?" → Cites company overview
- "Who's the CTO?" → References team directory
- "Tell me about AgentShield" → Provides product details

✅ **Follow proper procedures**
- Taking messages → Uses documented protocol
- Scheduling appointments → Follows calendar rules
- Handling sensitive info → Knows security boundaries

✅ **Route inquiries correctly**
- Product questions → Maven (CPO)
- Technical questions → Unc Lumen (CTO)
- Partnership opportunities → Sam

✅ **Handle common scenarios**
- FAQs provide consistent responses
- Contact info ensures proper escalation
- Procedures maintain quality standards

✅ **Provide specific details**
- Team member roles and responsibilities
- AgentShield features and pricing
- Company background and focus

---

## Testing After Upload

**Test questions to verify knowledge base is working:**

1. **"Who is the Chief of Staff?"**
   - Should answer: Luna (me!)

2. **"What does AgentShield do?"**
   - Should provide product description

3. **"How much does it cost?"**
   - Should explain pricing model and offer to connect with partnerships

4. **"Can I speak to Jimmy?"**
   - Should follow proper procedure (take message or route)

5. **"Who handles product questions?"**
   - Should answer: Maven, Chief Product Officer

6. **"What time zone are you in?"**
   - Should answer: Pacific Time (PST/PDT)

7. **"Are you hiring?"**
   - Should provide FAQ response about sending resume

---

## If Knowledge Base Limit Reached

**Priority order (if you need to reduce):**

**Must have:**
1. 04-COMMON-PROCEDURES.md (most critical)
2. 05-FREQUENTLY-ASKED-QUESTIONS.md (handles common calls)

**High priority:**
3. 03-AGENTSHIELD-PRODUCT.md (core product)
4. 02-TEAM-DIRECTORY.md (routing)

**Nice to have:**
5. 01-COMPANY-OVERVIEW.md (background)
6. 06-CONTACT-INFORMATION.md (can be in system prompt)

---

## Maintenance

**Update knowledge base when:**
- Team changes (new agents, role changes)
- Product updates (new features, pricing)
- Procedures change
- New FAQs emerge from real calls

**How to update:**
1. Edit the .md file locally
2. Re-upload to ElevenLabs
3. Old version is replaced automatically

---

## Alternative Formats

**If ElevenLabs doesn't accept .md:**

**Convert to PDF:**
```bash
# Using Pandoc (if installed)
pandoc 01-COMPANY-OVERVIEW.md -o 01-COMPANY-OVERVIEW.pdf
```

**Convert to TXT:**
```bash
# Just rename (loses formatting)
cp 01-COMPANY-OVERVIEW.md 01-COMPANY-OVERVIEW.txt
```

**But:** Markdown (.md) should work fine with ElevenLabs.

---

## Location

**All files located at:**
```
/Users/jimmysmacstudio/clawd-luna/knowledge-base/
```

**Ready to upload!** 🌙

---

*Built: 2026-02-06 23:23 PST*
