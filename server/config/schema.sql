CREATE DATABASE IF NOT EXISTS pk_china_portal;
USE pk_china_portal;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100),
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('super_admin','admin','sector_lead','regional_focal_point','party_a','party_b') NOT NULL,
  sector VARCHAR(100),
  organization VARCHAR(100),
  phone VARCHAR(20),
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proposals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  party_a_id INT NOT NULL,
  sector VARCHAR(100) NOT NULL DEFAULT '',
  proposal_title VARCHAR(255) NOT NULL DEFAULT '',
  proposal_description TEXT,
  proposal_file_url VARCHAR(500),
  party_b_name VARCHAR(100),
  party_b_organization VARCHAR(100),
  party_b_email VARCHAR(150),
  party_b_phone VARCHAR(20),
  party_b_country VARCHAR(100),
  mou_scope TEXT,
  mou_description TEXT,
  mou_sector VARCHAR(100),
  mou_demand TEXT,
  mou_file_url VARCHAR(500),
  status ENUM('draft','submitted','approved','rejected') DEFAULT 'draft',
  party_b_user_id INT NULL,
  sector_lead_comment TEXT,
  reviewed_by INT NULL,
  submitted_at TIMESTAMP NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (party_a_id) REFERENCES users(id),
  FOREIGN KEY (party_b_user_id) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);
