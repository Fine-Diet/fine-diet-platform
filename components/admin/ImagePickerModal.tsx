/**
 * ImagePickerModal Component
 * 
 * Modal component for selecting images from the asset library.
 * Used in admin editors to replace manual URL inputs.
 */

import { useState, useEffect } from 'react';
import type { MediaAsset } from '@/lib/mediaAssetsTypes';

interface ImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  currentValue?: string;
}

export function ImagePickerModal({ isOpen, onClose, onSelect, currentValue }: ImagePickerModalProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch assets when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchAssets();
    }
  }, [isOpen]);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/assets');
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

  // Filter assets by search term
  const filteredAssets = assets.filter((asset) =>
    asset.filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (asset: MediaAsset) => {
    setSelectedAsset(asset);
  };

  const handleConfirm = () => {
    if (selectedAsset) {
      onSelect(selectedAsset.public_url);
      onClose();
    }
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Select Image</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <input
            type="text"
            placeholder="Search by filename..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Loading assets...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600">{error}</p>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">
                {searchTerm ? 'No assets found matching your search.' : 'No assets found. Upload images in the Asset Library.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {filteredAssets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => handleSelect(asset)}
                  className={`group relative aspect-square bg-gray-200 rounded-lg overflow-hidden border-2 transition-all ${
                    selectedAsset?.id === asset.id
                      ? 'border-blue-500 ring-2 ring-blue-200'
                      : 'border-transparent hover:border-gray-300'
                  }`}
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
                  {selectedAsset?.id === asset.id && (
                    <div className="absolute top-1 right-1 bg-blue-500 rounded-full p-1">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Preview & Actions */}
        {selectedAsset && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0">
                <img
                  src={selectedAsset.public_url}
                  alt={selectedAsset.alt_text || selectedAsset.filename}
                  className="w-20 h-20 object-cover rounded-lg border border-gray-300"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{selectedAsset.filename}</p>
                {selectedAsset.width && selectedAsset.height && (
                  <p className="text-xs text-gray-500">
                    {selectedAsset.width} × {selectedAsset.height}
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleCopyUrl(selectedAsset.public_url)}
                    className="text-xs px-3 py-1 bg-white border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                  >
                    Copy URL
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex items-center justify-between">
          <a
            href="/admin/assets"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Open Asset Library →
          </a>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedAsset}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Select Image
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
