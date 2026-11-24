import React, { useState, useRef } from 'react';
import { uploadImage } from '../../api/uploads';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Cloudflare R2 Image Uploader component with drag-and-drop,
 * client-side pre-validation, instant preview, and upload telemetry.
 */
export function ImageUploader({
  tournamentId,
  category = 'crests',
  currentUrl = null,
  onUploadSuccess,
  onRemove,
  label = 'Upload Image',
  aspectRatio = 'square',
  maxSizeMB = 5,
  disabled = false,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(currentUrl);
  const [errorMessage, setErrorMessage] = useState(null);
  const fileInputRef = useRef(null);

  const maxBytes = maxSizeMB * 1024 * 1024;

  const validateFile = (file) => {
    if (!file) return 'No file selected';
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Unsupported format. Allowed: JPEG, PNG, WebP';
    }
    if (file.size > maxBytes) {
      return `File exceeds maximum allowed size of ${maxSizeMB} MB (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
    }
    return null;
  };

  const handleFileProcess = async (file) => {
    const error = validateFile(file);
    if (error) {
      setErrorMessage(error);
      return;
    }

    setErrorMessage(null);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);

    if (!tournamentId) {
      setErrorMessage('Tournament ID is required for cloud upload');
      return;
    }

    try {
      setIsUploading(true);
      const result = await uploadImage(file, tournamentId, category);
      setPreviewUrl(result.url);
      if (onUploadSuccess) {
        onUploadSuccess(result.url, result);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to upload image to cloud storage');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled && !isUploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileProcess(e.target.files[0]);
    }
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    setPreviewUrl(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (onRemove) {
      onRemove();
    }
  };

  const isBanner = aspectRatio === 'banner';

  return (
    <div className="image-uploader-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {label && (
        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}

      <div
        className={`image-uploader-dropzone ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled && !isUploading) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        style={{
          position: 'relative',
          width: '100%',
          minHeight: isBanner ? '120px' : '100px',
          borderRadius: '10px',
          border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--border-subtle)'}`,
          backgroundColor: isDragging ? 'var(--primary-subtle, rgba(16, 185, 129, 0.08))' : 'var(--bg-elevated)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled || isUploading ? 'not-allowed' : 'pointer',
          overflow: 'hidden',
          transition: 'all 0.2s ease',
          padding: '12px',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
          disabled={disabled || isUploading}
        />

        {previewUrl ? (
          <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src={previewUrl}
              alt="Uploaded preview"
              style={{
                maxWidth: '100%',
                maxHeight: isBanner ? '160px' : '90px',
                borderRadius: '6px',
                objectFit: 'contain',
              }}
            />
            {!isUploading && !disabled && onRemove && (
              <button
                type="button"
                onClick={handleRemove}
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  background: 'rgba(239, 68, 68, 0.85)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
                title="Remove image"
              >
                ×
              </button>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>☁️</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>
              {isDragging ? 'Drop image here' : 'Click or drag image here'}
            </div>
            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
              JPEG, PNG, or WebP (max {maxSizeMB} MB)
            </div>
          </div>
        )}

        {isUploading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(11, 15, 20, 0.85)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)',
              gap: '6px',
            }}
          >
            <div className="spinner" style={{ width: '24px', height: '24px' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Uploading to R2...</span>
          </div>
        )}
      </div>

      {errorMessage && (
        <div
          role="alert"
          style={{
            color: 'var(--danger, #EF4444)',
            fontSize: '0.8rem',
            padding: '4px 8px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderRadius: '4px',
            borderLeft: '3px solid var(--danger, #EF4444)',
          }}
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}
