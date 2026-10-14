CREATE TABLE `bookmarks` (
	`user_id` text NOT NULL,
	`article_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`url` text NOT NULL,
	`image_url` text,
	`source` text NOT NULL,
	`source_url` text,
	`published_at` text,
	`country` text NOT NULL,
	`category` text NOT NULL,
	`language` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `article_id`)
);
--> statement-breakpoint
CREATE INDEX `bookmarks_user_created_at_idx` ON `bookmarks` (`user_id`,`created_at`);