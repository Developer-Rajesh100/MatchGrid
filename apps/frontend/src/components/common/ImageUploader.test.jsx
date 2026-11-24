import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImageUploader } from './ImageUploader';
import * as uploadsApi from '../../api/uploads';

vi.mock('../../api/uploads', () => ({
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
}));

describe('ImageUploader Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost:5173/mock-uuid');
  });

  it('renders initial dropzone with instructions', () => {
    render(
      <ImageUploader
        tournamentId="t123"
        category="crests"
        label="Team Crest"
      />
    );

    expect(screen.getByText('Team Crest')).toBeInTheDocument();
    expect(screen.getByText(/Click or drag image here/i)).toBeInTheDocument();
    expect(screen.getByText(/JPEG, PNG, or WebP/i)).toBeInTheDocument();
  });

  it('renders current image when currentUrl is provided', () => {
    render(
      <ImageUploader
        tournamentId="t123"
        category="crests"
        currentUrl="https://cdn.matchgrid.app/tournaments/t123/crests/crest.png"
      />
    );

    const img = screen.getByAltText('Uploaded preview');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://cdn.matchgrid.app/tournaments/t123/crests/crest.png');
  });

  it('rejects oversized files on the client side without calling the API', async () => {
    render(
      <ImageUploader
        tournamentId="t123"
        category="crests"
        maxSizeMB={5}
      />
    );

    const dropzone = screen.getByRole('button');
    // 6 MB file
    const oversizedFile = new File(['x'.repeat(6 * 1024 * 1024)], 'huge.png', { type: 'image/png' });

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [oversizedFile] },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/exceeds maximum allowed size/i);
    });

    expect(uploadsApi.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects unsupported file formats on client side', async () => {
    render(
      <ImageUploader
        tournamentId="t123"
        category="crests"
      />
    );

    const dropzone = screen.getByRole('button');
    const textFile = new File(['hello world'], 'doc.pdf', { type: 'application/pdf' });

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [textFile] },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Unsupported format/i);
    });

    expect(uploadsApi.uploadImage).not.toHaveBeenCalled();
  });

  it('successfully uploads valid image and triggers onUploadSuccess', async () => {
    const onUploadSuccess = vi.fn();
    uploadsApi.uploadImage.mockResolvedValueOnce({
      url: 'https://cdn.matchgrid.app/tournaments/t123/crests/uploaded.png',
      key: 'tournaments/t123/crests/uploaded.png',
    });

    render(
      <ImageUploader
        tournamentId="t123"
        category="crests"
        onUploadSuccess={onUploadSuccess}
      />
    );

    const dropzone = screen.getByRole('button');
    const validFile = new File(['fake-image-bytes'], 'crest.png', { type: 'image/png' });

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [validFile] },
    });

    await waitFor(() => {
      expect(uploadsApi.uploadImage).toHaveBeenCalledWith(validFile, 't123', 'crests');
      expect(onUploadSuccess).toHaveBeenCalledWith(
        'https://cdn.matchgrid.app/tournaments/t123/crests/uploaded.png',
        expect.any(Object)
      );
    });
  });

  it('displays error banner if upload API fails', async () => {
    uploadsApi.uploadImage.mockRejectedValueOnce(new Error('Network error uploading to R2'));

    render(
      <ImageUploader
        tournamentId="t123"
        category="crests"
      />
    );

    const dropzone = screen.getByRole('button');
    const validFile = new File(['fake-image-bytes'], 'crest.png', { type: 'image/png' });

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [validFile] },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error uploading to R2');
    });
  });

  it('calls onRemove and clears preview when remove button is clicked', () => {
    const onRemove = vi.fn();
    render(
      <ImageUploader
        tournamentId="t123"
        category="crests"
        currentUrl="https://cdn.matchgrid.app/sample.png"
        onRemove={onRemove}
      />
    );

    const removeBtn = screen.getByTitle('Remove image');
    fireEvent.click(removeBtn);

    expect(onRemove).toHaveBeenCalled();
    expect(screen.queryByAltText('Uploaded preview')).not.toBeInTheDocument();
  });
});
