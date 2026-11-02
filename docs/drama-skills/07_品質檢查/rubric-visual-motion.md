> 來源：zenstory-ai/drama-skills v0.10.0 `skills/short-drama-review/references/rubric-visual-motion.md`（MIT 授權，見根目錄 LICENSE）。本檔由簡體自動轉為繁體，內容未改寫。

# Storyboard, Keyframe, And Motion Rubric

## 目錄

- [Coverage](#coverage-and-meaning)
- [Shot](#shot-purpose-and-geography)
- [Keyframe](#frozen-keyframe)
- [Motion](#motion)
- [Continuity](#cross-shot-continuity)
- [Rhythm profile](#rhythm-profile-shots)
- [Findings](#common-findings)
- [Production risks and authorized observations](#production-risk-and-authorized-observation-checklist-rev-08)

## Coverage and meaning

- Can every production-relevant action, line, sound, or on-screen text in `劇本.md` be traced to a shot or an explicit omission reason?
- Are omissions/repeats explained?
- Does each shot preserve the source action, dialogue, information, and reaction?
- Has downstream work invented or deleted a story fact?

## Shot purpose and geography

- For a high-value scene with an accepted coverage audition: did the approaches
  genuinely differ — in knowledge timing, audience alignment, performance space,
  strongest image, landing, losses, or production fit?
- Do the final shots in `分鏡.md` implement the approach the creator selected?
- When a scene visual plan was used: do its start/end audience positions, spatial
  pressure, camera rhythm, reaction landing, and sound movement carry **one** dramatic turn?
- Does that plan stay clear of owning shot boundaries? (Ordinary scenes need no plan
  merely to satisfy a form.)
- What changes for audience or character by the shot end?
- Why is this a new shot?
- Do framing and camera behavior serve attention, alignment, pressure, reveal, or
  rhythm rather than decorate the prose?
- Does each shot's `運鏡` line state a behavior and a reason chosen from the shot's
  purpose (`SHT-04`)? A stated lock-off with its reason passes. An episode locked on
  nearly every shot while its peak gets no movement is a finding; so is a missing line,
  which leaves the choice to the video-prompt stage; a bare 「運鏡：固定」 with no reason
  is also a finding.
- Are Location/View, axis, screen direction, eyelines, entrances, positions,
  hands, and props coherent?
- Are exact asset variants bound?
- Does the shot expose every fact it must carry while protecting
  facts the source withholds until a later action or cut?
- Do crop, occlusion, focus, back view, and offscreen space serve that information
  permission rather than accidentally reveal or conceal it?

## Rhythm profile: shots

Under the `REV-12` conditions in the [story rubric](rubric-story-script.md#rhythm-profile-rev-12),
measure two storyboard fields: the average shot length per scene (scene duration divided
by its shot count) against `target_avg_shot_seconds`, and the share of close-range shots
across the episode against `close_shot_share_min`. Close-range shots include 近景、特寫、大特寫 and 細節鏡頭;
divide their count by the episode's total shot count. The average is a
scene-level target; one long or short shot is not a finding. Also report durations folded
from screenplay word counts instead of the scene's sound timeline (`SHT-28`).

## Frozen keyframe

- Can all described facts exist in one still instant?
- Does it project the start state written for this shot?
- Are focal hierarchy, composition, camera/lens, geography, pose/gaze/hands/prop,
  expression, and light legible?
- Does it avoid ordered actions, performance arcs, camera moves, or transforming
  environments?
- Read the finished keyframe text, not the shot's intent: is every visible character,
  place, and prop whose identity, Look, or geography must stay recognizable listed in
  this shot's `視覺依據` (`SHT-22`)? A second body that entered the composition while the
  frame was being written is the usual miss.
- Does each declared 控制 scope stay inside what this frame can carry, and is nothing
  bound merely because it was bound in the previous shot (`SHT-24`)?
- When real reference images are bound, does every `REF-...` slot declare a 用途, so the
  shot says which start frame and which identity/geography/prop pictures it sends
  (`SHT-25`, `VID-24`)?
- Is anything the frames need kept consistent across shots — a carried prop, a garment —
  absent from `視覺設定.md` entirely, so it can appear in no shot's basis at all? The
  mechanical check cannot see this: an entry that does not exist cannot be reported missing.

## Motion

- Does it start from the accepted frame/boundary?
- Are subject actions ordered and feasible within the accepted duration while preserving the intended performance?
- Does performance change express the story move rather than stack synonyms?
- In multi-character motion: do the actors who actually change have distinct,
  readable triggers, choices, leaks, or landings — as this shot needs, not one
  identical arc per actor?
- Is attention handed off only where it truly transfers, rather than for
  synchronized reaction?
- Does any text-readiness claim cite the current creator-visible inputs and a real blocking gap?
- Does it avoid any claim about generated media quality or create a second readiness truth?
- Is camera behavior coherent and motivated?
- Are environment motion, dialogue, SFX, and audio included only when relevant?
- Does the described end match the storyboard's written end state without rewriting the next shot?
- When a reference frame carries appearance/composition, does motion prose retain only the visual facts this shot needs?
- Does every claim about text-bearing reference pixels cite a creator/reference-owner
  description or an authorized input-reference observation? Without that evidence,
  is admission still `unverified` instead of pretending a negative prompt solved it?
- For any selective transform, are the accepted trigger, exact target scope,
  end geometry/state, and preserve set explicit? Do non-target people, props,
  text surfaces, and spatial anchors keep their required position, count, and state?
- Does each media reference state its exact purpose, what may be copied, and what
  must not be copied, rather than treating all visible pixels as authority?

For a copyable body (`VID-22`, `VID-23`), check that actions and sound match the
source and that the timeline accounts for the intended ambience or silence.
A summary must not introduce a layer absent from the shot. H3's
`non_diegetic_music: N/A` is a valid empty music layer.

Report a concrete contradiction, omission or ambiguity. A negative clause is
not a defect by itself; do not impose a clause count or assume that negation
causes the model to generate the excluded content. Keep model-specific
observations scoped to their tested model and execution path.

For a pickup or alternate, ask these separately:

- Does the pickup/alternate identify its master? Keep candidate differences in ordinary notes and one formal `MOTION-...` with one copyable body per `SHOT-...`; a separate pickup first needs its own storyboard shot.
- Is every source obligation assigned to the master, this version, another named version or a requested storyboard revision?
- Are the changed items and the items that must remain unchanged explicit?
- Is replacement only requested here? The review Markdown decides whether to adopt the candidate; the owning skill then updates the formal body.

For music, ask these separately (`VID-14`):

- Is intent written as a relative entry/exit/duck against neighbouring shots,
  rather than an independent cue per shot?
- Do adjacent annotations actually join?
- Does the text ask for a per-shot music bed against an accepted timeline-layer plan?
- Whether a rendered clip carries a baked-in track is **not decidable here**. Cite it
  only from an authorized text observation record; otherwise keep it `unverified`
  and never infer a mix result from prose.

Explicit timing that does not sum exactly to its shot's accepted duration—over or
under—is a structural error. Untimed overload is a
reviewed feasibility question: cite which action/performance/story beat would be
lost, not a universal verbs-per-second formula.

Container arithmetic is a separate structural check (`VID-13`). Count the accepted
shots a delivery container carries, then confirm its duration equals the sum of
their accepted durations. For a multi-shot container, confirm the members are
contiguous in source order, share one geography/asset binding chain, do not cross a
scene boundary, and each remains independently reviewable. A space or subject jump
belongs on a member boundary; the same jump inside a member's timed segment is a
hidden cut. Report an arithmetic mismatch and a hidden cut as two findings, not one.

- Is the axis recorded as two named anchors, a stated working side, and a per-character
  screen position — rather than a placeholder?
- In a shot-reverse-shot pair, are the two screen directions complementary?
- Bare left/right always means **screen** left/right. Where a subject's own side is
  meant, does the text name the subject?

## Cross-shot continuity

Trace Look, injury, dirt/wetness, emotion/knowledge, position/facing/gaze, hands,
held prop, prop owner/state, location/time/weather/light, axis, and screen
direction. Distinguish unexplained contradiction from declared montage,
ellipsis, dream, or deliberate disorientation.

## Common findings

- beautiful shot with no dramatic purpose;
- dialogue covered but consequential reaction absent;
- anonymous asset or wrong variant;
- cross-location/time action hidden in one ordinary shot;
- keyframe contains “first/then/finally”;
- locked camera also pans or pushes in the same interval;
- motion invents a grab, injury, transfer, relationship change, or line;
- a selective transform removes, copies, or reshapes a non-target person, prop,
  text surface, or spatial anchor because its preserve set was unspecified;
- end pose/prop state disagrees with next start;
- every emotional beat uses the same close-up/push template;
- provider batching is mistaken for editorial shot structure.
- a narrowed pickup silently replaces the master and drops dialogue, reaction,
  reveal, end-state, or creator-directive obligations.

## Production-risk and authorized-observation checklist (REV-08)

本套件不檢視媒體。先把下列專案當作文字風險，引用準確的 prompt/spec 說明為什麼會造成
執行歧義或違背已接受約束；只有創作者提供了授權的文字觀察記錄時，才能稱為已觀察缺陷，
並把該記錄作為外部證據引用。沒有觀察記錄時保持結果未知，不從任務成功、結果地址或提示詞
存在推斷成片品質。

需要專案校準時，先區分輸入參考與生成結果。後一種觀察須繫結準確的提示詞/鏡頭標題、參考順序、
製作形態/配置、觀察方法和限制；先按 `REV-11` 選擇處置，需要改動時再寫最小修改項與保持項。
結論只在該專案和版本條件下有效。

短劇生產中需要防範的文字風險或獲授權觀察包括：

- on-screen text or subtitle residue despite a declared no-text constraint;
- a text-bearing reference admitted under no-text or exact-readable policy
  without an allowed surface or a crop, clean, mask, or replace decision;
- background music implied where the audio boundary allows sound effects only;
- wardrobe or look drift against the bound reference (re-describing clothes the
  reference already fixes invites drift — flag redundant appearance prose);
- 180° axis violation or eyeline mismatch across consecutive shots without a
  declared transition;
- lip-sync mismatch: dialogue bound to the wrong character, inner monologue
  written as mouthed speech, or extra lines the source dialogue never contained;
- explicit segment timings that do not sum exactly to the shot duration, in either direction;
- emotion-intensity mismatch between stated level and described performance
  (a declared 9/10 rage performed as mild irritation, or the reverse).
