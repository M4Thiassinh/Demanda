-- Tabla clave-valor para estado interno de la app que debe sobrevivir reinicios.
-- Uso actual: recordar la última fecha en que se envió el correo consolidado
-- Teja Food, para no reenviarlo dos veces aunque el proceso se reinicie.
CREATE TABLE IF NOT EXISTS app_estado (
  clave       VARCHAR(64)  NOT NULL PRIMARY KEY,
  valor       VARCHAR(255) NULL,
  actualizado TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
