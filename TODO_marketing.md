# Godwit marketing TODO

Saved from the marketing and video discussion on 7 October 2026.
This is a proposed plan, not a record of completed campaigns or proven results.

## Strategy

Focus on one target market, demonstrate a concrete use case, support a few
successful pilots, then reuse the evidence in outreach and social media.
OpenAI can help draft relevant emails; it does not replace a clear offer,
human review, or proof that the product is useful.

- [ ] Choose one initial market and location.
  - Recommended starting hypothesis: independent hotels and guesthouses where
    the founders can speak with owners or visit personally.
  - Change focus if real outreach results show stronger interest from tour
    operators, venues, or another segment.
- [ ] Use a specific value proposition rather than marketing to every category:
  > Find out what guests would improve before their next stay, with a short QR
  > survey and no app to install.
- [ ] Offer a bounded, guided two-week pilot around one use case.
  - One QR placement, such as reception or checkout.
  - Two or three focused questions.
  - Review responses with the owner and identify one possible improvement.
  - Explain what happens afterward; no automatic paid commitment.
- [ ] Aim to support three pilots before investing heavily in advertising.

## Two separate videos

Use AI for scripts, storyboards, captions, and optionally narration.
Use real recordings for the product itself. Fully AI-generated product screens
can invent text, features, and interactions and are not suitable as proof.

### Demonstration video

- [ ] Produce a 60-90-second horizontal demonstration for the website, LinkedIn,
  and relevant email follow-ups.
- [ ] Choose one scenario, such as a guesthouse collecting checkout feedback.
- [ ] Create a dedicated demo workspace with fictional business information.
- [ ] Create a short poll with two questions and print its real QR code.
- [ ] Film someone scanning the code with a phone.
- [ ] Record the actual phone workflow and dashboard separately.
- [ ] Label sample responses "Demo data" and hide account details, emails,
  private messages, and other personal data.

Suggested storyboard:

| Scene | What to show |
| --- | --- |
| Problem | "What would your guests improve about their stay?" |
| Placement | A real Godwit QR card at reception or checkout |
| Visitor experience | Scan, answer two short questions, submit |
| Business experience | Review responses in the real dashboard |
| Call to action | "Test one feedback use case in a guided two-week pilot." |

Keep the demonstration about the workflow, not a detailed tour of every button.

### Advertisement video

- [ ] Produce a separate 20-30-second vertical video for Instagram Reels and
  social posts, reusing the demonstration footage.
- [ ] Use mostly real-world footage, readable text, and a brief product clip.
- [ ] End with the Godwit logo, https://hellogodwit.com, and one clear action.

Suggested narration:

> What would your guests improve, but never tell you?
>
> With Godwit, they scan a QR code and answer a short poll. No app. No account.
>
> Your team reviews the feedback and decides what to improve.
>
> Explore a guided two-week pilot at hellogodwit.com.

Suggested visuals: reception or a guest interaction, a printed QR card, a phone
scanning it, an actual poll recording, then the logo and website.

## Simple, economical tool setup

| Task | Suggested tool |
| --- | --- |
| Scripts, storyboards, captions | ChatGPT |
| Screen capture | OBS Studio or an existing screen recorder |
| Editing, captions, resizing | Canva or CapCut; choose one |
| Narration | Founder voice initially; optional AI voice later |
| Real-world footage | A phone or commercially licensed stock footage |

- [ ] Start with free editing features and a clear founder narration.
- [ ] Check current pricing before buying any subscription; prices and included
  features change.
- [ ] Avoid buying several AI subscriptions or an AI-avatar service initially.
- [ ] Verify commercial advertising rights for any AI voice, music, stock
  footage, or other assets. An asset being available in an editor does not mean
  it is licensed for every advertising use.
- [ ] Only share non-sensitive demo material with external AI/editing tools.
- [ ] Do not invent testimonials or promise guaranteed revenue, positive
  reviews, or capabilities that Godwit does not actually provide.

## Keep videos maintainable as the interface changes

- [ ] Save the editable project and source recordings, not just the final MP4.
- [ ] Build independent scenes with replaceable product clips.
  - Stable: problem, QR placement, branding, narration, call to action.
  - Replaceable: phone UI recording and dashboard recording.
- [ ] Keep narration independent of screen layout.
  - Prefer: "Review the responses in your dashboard."
  - Avoid: "Click the green button at the top right, then open the third tab."
- [ ] Replace only the relevant screen clips when Godwit changes.
- [ ] Add captions and check both videos without sound.
- [ ] Export horizontal and vertical versions and test readability on a phone.

## Social channels

### LinkedIn: priority for business conversations

- [ ] Create a Godwit company page and improve the founder's personal profile.
- [ ] Publish roughly two useful posts per week:
  - Product demonstration.
  - A concrete use case or example questions.
  - A pilot lesson, published with the business's permission.
  - What Godwit does and does not do.
- [ ] Engage thoughtfully with owners, hospitality consultants, and partners.
- [ ] Avoid mass connection requests followed by automated pitches.

### Instagram: demonstration and credibility

- [ ] Create a Godwit account without committing to daily posting.
- [ ] Pin the demonstration, "How Godwit works," and the pilot offer.
- [ ] Share real QR placements and short practical examples.
- [ ] Treat credibility and enquiries as more important than follower count.

## Outreach, proof, and partnerships

- [ ] Combine relevant, human-reviewed outreach with hands-on demonstrations.
- [ ] Bring a working QR demo to nearby businesses.
- [ ] Link to the short video in remote follow-ups instead of attaching a large
  video file.
- [ ] Check applicable marketing-consent rules before sending campaigns.
  A public business email address is not automatically permission for
  unsolicited marketing, especially in markets such as Austria.
- [ ] Turn useful pilots into evidence, with permission:
  - Short case study.
  - Genuine owner testimonial.
  - Photograph of Godwit in use.
  - A real decision informed by feedback.
- [ ] Publish only measured results that actually occurred.
- [ ] Approach hospitality consultants, local web agencies, and tourism networks
  once there is evidence they can confidently share.
- [ ] Publish organically and use the videos in appropriate follow-ups before
  spending on paid ads.

## Suggested first-month sequence

| Week | Priority |
| --- | --- |
| 1 | Choose a segment, record the demo, create social profiles |
| 2 | Start relevant conversations and demonstrate the product |
| 3 | Help interested businesses launch small pilots |
| 4 | Review results, improve the offer, request case-study permission |

## Measurement

- [ ] Track qualified conversations, pilots started, pilots actively used, and
  paying customers.
- [ ] Separate genuine interest from automatic email replies.
- [ ] Use video views and social likes as secondary signals, not proof of sales.
- [ ] Use website visits as supporting context, not a count of distinct people
  or proof of conversion.
  - The website counter implementation was pushed in commit `473a752`.
  - Activation still requires applying the database migration; this discussion
    did not verify that it was applied.
  - See [website visit setup](docs/WEBSITE_VISITS.md).
  - Counts consented public-website sessions; excludes signed-in users and
    QR/voting pages. Historical visits cannot be recovered.
- [ ] Improve the opening, target audience, and pilot offer based on actual
  conversations and enquiries.
