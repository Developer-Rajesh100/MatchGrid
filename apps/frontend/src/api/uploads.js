import { apiClient } from './client';

/**
 * Uploads an image file to Cloudflare R2 media storage.
 * @param {File} file The image file to upload.
 * @param {string} tournamentId ID of the tournament owning this asset.
 * @param {'crests'|'photos'|'logos'|'banners'} category Media category.
 * @returns {Promise<{url: string, key: string, category: string, tournament_id: string, content_type: string, size_bytes: number, width: number, height: number}>}
 */
export async function uploadImage(file, tournamentId, category) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('tournament_id', tournamentId);
  formData.append('category', category);

  return apiClient('/api/uploads/image', {
    method: 'POST',
    body: formData,
  });
}

/**
 * Deletes an image from Cloudflare R2 media storage.
 * @param {string} urlOrKey Full CDN URL or R2 storage key.
 * @returns {Promise<{deleted: boolean, key: string}>}
 */
export async function deleteImage(urlOrKey) {
  return apiClient('/api/uploads/image', {
    method: 'DELETE',
    body: { url_or_key: urlOrKey },
  });
}
