-- Schema only; no application records are included.
SET NAMES utf8mb4;

CREATE TABLE `drivers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `phone` varchar(50) NOT NULL,
  `license_number` varchar(100) NOT NULL,
  `license_expiry` date DEFAULT NULL,
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `photo_url` varchar(2048) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `guardians` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `relationship` varchar(100) DEFAULT NULL,
  `phone` varchar(50) NOT NULL,
  `secondary_phone` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `address` text,
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `latitude` double DEFAULT NULL,
  `longitude` double DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `routes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `start_point` varchar(255) NOT NULL,
  `end_point` varchar(255) NOT NULL,
  `departure_time` time DEFAULT NULL,
  `vehicle_id` bigint unsigned DEFAULT NULL,
  `driver_id` bigint unsigned DEFAULT NULL,
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `end_latitude` double DEFAULT NULL,
  `end_longitude` double DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_routes_vehicle` (`vehicle_id`),
  KEY `fk_routes_driver` (`driver_id`),
  CONSTRAINT `fk_routes_driver` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_routes_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sessions` (
  `token_hash` varchar(255) NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `expires_at` bigint NOT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `fk_sessions_user` (`user_id`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `students` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `birth_date` date DEFAULT NULL,
  `class_name` varchar(100) DEFAULT NULL,
  `guardian_name` varchar(255) DEFAULT NULL,
  `guardian_phone` varchar(50) DEFAULT NULL,
  `pickup_address` text,
  `notes` text,
  `guardian_id` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `route_id` bigint unsigned DEFAULT NULL,
  `photo_url` varchar(2048) DEFAULT NULL,
  `school_name` varchar(160) DEFAULT NULL,
  `school_phone` varchar(40) DEFAULT NULL,
  `emergency_contact_name` varchar(160) DEFAULT NULL,
  `emergency_contact_phone` varchar(40) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_students_guardian` (`guardian_id`),
  KEY `students_route_id_index` (`route_id`),
  CONSTRAINT `fk_students_guardian` FOREIGN KEY (`guardian_id`) REFERENCES `guardians` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `trip_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `trip_id` bigint unsigned NOT NULL,
  `type` varchar(24) NOT NULL,
  `recorded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `trip_events_trip_index` (`trip_id`,`recorded_at`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `trip_reports` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `trip_id` bigint unsigned NOT NULL,
  `driver_id` bigint unsigned NOT NULL,
  `type` varchar(20) NOT NULL,
  `description` varchar(1000) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `trip_reports_trip_index` (`trip_id`),
  KEY `trip_reports_driver_index` (`driver_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `trip_student_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `trip_id` bigint unsigned NOT NULL,
  `student_id` bigint unsigned NOT NULL,
  `status` varchar(20) NOT NULL,
  `recorded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `trip_student_events_history_index` (`student_id`,`recorded_at`),
  KEY `trip_student_events_trip_index` (`trip_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `trip_student_status` (
  `trip_id` bigint unsigned NOT NULL,
  `student_id` bigint unsigned NOT NULL,
  `status` varchar(20) NOT NULL,
  `recorded_at` datetime NOT NULL,
  PRIMARY KEY (`trip_id`,`student_id`),
  KEY `trip_student_status_student_index` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `trips` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `route_id` bigint unsigned NOT NULL,
  `trip_date` date NOT NULL,
  `departure_time` time DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'scheduled',
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `started_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_trips_route` (`route_id`),
  CONSTRAINT `fk_trips_route` FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `role` varchar(50) NOT NULL DEFAULT 'admin',
  `guardian_id` bigint unsigned DEFAULT NULL,
  `driver_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `guardian_id` (`guardian_id`),
  UNIQUE KEY `users_driver_unique` (`driver_id`),
  UNIQUE KEY `users_guardian_unique` (`guardian_id`),
  CONSTRAINT `fk_users_guardian` FOREIGN KEY (`guardian_id`) REFERENCES `guardians` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `vehicle_locations` (
  `trip_id` bigint unsigned NOT NULL,
  `latitude` double NOT NULL,
  `longitude` double NOT NULL,
  `accuracy` double DEFAULT NULL,
  `recorded_at` datetime NOT NULL,
  PRIMARY KEY (`trip_id`),
  CONSTRAINT `fk_vehicle_locations_trip` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `vehicles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `plate` varchar(50) NOT NULL,
  `model` varchar(255) NOT NULL,
  `capacity` int NOT NULL,
  `year` int DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'active',
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `driver_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `plate` (`plate`),
  KEY `vehicles_driver_id_index` (`driver_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;