const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Sube un buffer de imagen (recibido via multer, memoryStorage) a Cloudinary.
 * @param {Buffer} buffer
 * @param {string} folder - carpeta destino en Cloudinary (ej. 'establo/incidencias')
 * @returns {Promise<string>} secure_url de la imagen subida
 */
function subirImagen(buffer, folder = 'establo') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

module.exports = { subirImagen };
