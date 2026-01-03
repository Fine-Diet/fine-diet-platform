/**
 * Admin Page: Media Assets Library
 * 
 * Upload, browse, and manage media assets (images) stored in Supabase Storage.
 * Requires admin or editor role.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import type { MediaAsset } from '@/lib/mediaAssetsTypes';

interface AssetsPageProps {
  user: AuthenticatedUser;
}

export default function AssetsPage({ user }: AssetsPageProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [altText, setAltText] = useState('');
  const [savingAltText, setSavingAltText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Fetch assets
  const fetchAssets = async (search: string = '') => {
    try {
      setLoading(true);
      setError(null);
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      const response = await fetch(`/api/admin/assets${query}`);
      const data = await response.json();

      if (data.success && data.assets) {
        setAssets(data.assets);
      } else {
        setError(data.error || 'Failed to load assets');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets(searchTerm);
  }, [searchTerm]);

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('Only image files are supported');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64Data = reader.result as string;
          
          // Determine folder based on file name or use misc
          const folder = 'misc'; // Can be enhanced with folder selection UI

          const response = await fetch('/api/admin/assets/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              file: base64Data,
              filename: file.name,
              folder,
            }),
          });

          const data = await response.json();

          if (data.success && data.asset) {
            // Refresh asset list
            await fetchAssets(searchTerm);
            setUploadError(null);
          } else {
            setUploadError(data.error || 'Upload failed');
          }
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
          setUploading(false);
        }
      };
      reader.onerror = () => {
        setUploadError('Failed to read file');
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
    }
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle drag and drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // Handle asset selection
  const handleAssetClick = async (asset: MediaAsset) => {
    setSelectedAsset(asset);
    setAltText(asset.alt_text || '');
  };

  // Handle close preview
  const handleClosePreview = () => {
    setSelectedAsset(null);
    setAltText('');
  };

  // Copy URL to clipboard
  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      // Could show a toast notification here
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  // Save alt text
  const handleSaveAltText = async () => {
    if (!selectedAsset) return;

    setSavingAltText(true);
    try {
      const response = await fetch(`/api/admin/assets/${selectedAsset.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          alt_text: altText || null,
        }),
      });

      const data = await response.json();

      if (data.success && data.asset) {
        setSelectedAsset(data.asset);
        // Refresh asset list
        await fetchAssets(searchTerm);
      }
    } catch (err) {
      console.error('Failed to save alt text:', err);
    } finally {
      setSavingAltText(false);
    }
  };

  // Delete asset
  const handleDeleteAsset = async () => {
    if (!selectedAsset || user.role !== 'admin') return;
    if (!confirm(`Are you sure you want to delete "${selectedAsset.filename}"?`)) return;

    try {
      const response = await fetch(`/api/admin/assets/${selectedAsset.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        handleClosePreview();
        await fetchAssets(searchTerm);
      } else {
        setError(data.error || 'Failed to delete asset');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete asset');
    }
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <Head>
        <title>Media Assets • Fine Diet Admin</title>
      </Head>
      <div className="bg-gray-100 pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/admin"
              className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
            >
              ← Back to Admin Dashboard
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">Media Assets</h1>
                <p className="text-lg text-gray-600">
                  Upload and manage images for use across the site
                </p>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Upload Area */}
          <div
            className={`mb-6 border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileInputChange}
              className="hidden"
              disabled={uploading}
            />
            {uploading ? (
              <div>
                <p className="text-gray-600">Uploading...</p>
              </div>
            ) : (
              <div>
                <p className="text-gray-600 mb-2">
                  Drag and drop an image here, or{' '}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    browse files
                  </button>
                </p>
                <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
              </div>
            )}
            {uploadError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                <p className="text-sm text-red-800">{uploadError}</p>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="mb-6">
            <input
              type="text"
              placeholder="Search by filename..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Assets Grid */}
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Loading assets...</p>
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-600">No assets found. Upload an image to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => handleAssetClick(asset)}
                  className="group relative aspect-square bg-gray-200 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all"
                >
                  <img
                    src={asset.public_url}
                    alt={asset.alt_text || asset.filename}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-opacity flex items-center justify-center">
                    <p className="text-white text-xs opacity-0 group-hover:opacity-100 px-2 text-center truncate w-full">
                      {asset.filename}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Preview Panel */}
          {selectedAsset && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-gray-900">Asset Preview</h2>
                    <button
                      onClick={handleClosePreview}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Preview Image */}
                  <div className="mb-6 flex justify-center bg-gray-100 rounded-lg p-4">
                    <img
                      src={selectedAsset.public_url}
                      alt={selectedAsset.alt_text || selectedAsset.filename}
                      className="max-w-full max-h-96 object-contain"
                    />
                  </div>

                  {/* Metadata */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Filename
                      </label>
                      <p className="text-sm text-gray-900">{selectedAsset.filename}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Dimensions
                        </label>
                        <p className="text-sm text-gray-900">
                          {selectedAsset.width && selectedAsset.height
                            ? `${selectedAsset.width} × ${selectedAsset.height}`
                            : 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          File Size
                        </label>
                        <p className="text-sm text-gray-900">{formatFileSize(selectedAsset.size_bytes)}</p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Public URL
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={selectedAsset.public_url}
                          readOnly
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-900 text-sm"
                        />
                        <button
                          onClick={() => handleCopyUrl(selectedAsset.public_url)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                        >
                          Copy URL
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Alt Text
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={altText}
                          onChange={(e) => setAltText(e.target.value)}
                          placeholder="Describe the image for accessibility..."
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={handleSaveAltText}
                          disabled={savingAltText}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
                        >
                          {savingAltText ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>

                    {/* Delete Button (Admin Only) */}
                    {user.role === 'admin' && (
                      <div className="pt-4 border-t border-gray-200">
                        <button
                          onClick={handleDeleteAsset}
                          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
                        >
                          Delete Asset
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AssetsPageProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/assets',
        permanent: false,
      },
    };
  }

  if (user.role !== 'admin' && user.role !== 'editor') {
    return {
      redirect: {
        destination: '/admin/unauthorized',
        permanent: false,
      },
    };
  }

  return {
    props: {
      user,
    },
  };
};
