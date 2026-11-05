ALTER TABLE `character_versions` ADD `identity_anchors` text;--> statement-breakpoint
ALTER TABLE `character_versions` ADD `look` text;--> statement-breakpoint
ALTER TABLE `character_versions` ADD `change_note` text;--> statement-breakpoint
ALTER TABLE `series` ADD `questionnaire_default_edits` text;--> statement-breakpoint
ALTER TABLE `videos` ADD `series_snapshot` text;--> statement-breakpoint
-- 既有影片補上保存的系列設定：用建立當下可取得的（系列目前的）設定
UPDATE `videos` SET `series_snapshot` = (
  SELECT json_object(
    'visualStyle', s.`visual_style`,
    'direction', s.`direction`,
    'defaultImageModel', s.`default_image_model`,
    'defaultVideoModel', s.`default_video_model`,
    'questionnaireDefaults', json(s.`questionnaire_defaults`)
  ) FROM `series` s WHERE s.`id` = `videos`.`series_id`
);
