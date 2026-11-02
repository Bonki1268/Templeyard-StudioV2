CREATE TABLE `temples` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`flags` text NOT NULL,
	`status` text NOT NULL,
	`district` text NOT NULL,
	`village` text,
	`address` text NOT NULL,
	`phone` text,
	`phone_raw` text NOT NULL,
	`deity` text NOT NULL,
	`religion` text NOT NULL,
	`founded_year` integer,
	`founded_raw` text NOT NULL,
	`rebuilt_year` integer,
	`rebuilt_raw` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `temples_name_normalized_idx` ON `temples` (`name_normalized`);--> statement-breakpoint
CREATE INDEX `temples_district_idx` ON `temples` (`district`);--> statement-breakpoint
CREATE INDEX `temples_deity_idx` ON `temples` (`deity`);