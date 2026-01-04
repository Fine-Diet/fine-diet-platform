/**
 * ImageFieldWithPicker Component
 * 
 * Inline image field with picker button and preview thumbnail.
 * Replaces simple text inputs for image URLs in admin editors.
 */

import { useState } from 'react';
import { ImagePickerModal } from './ImagePickerModal';

interface ImageFieldWithPickerProps {
  value: string;
  onChange: (url: string) => void;
  label: string;
  placeholder?: string;
  buttonText?: string;
}

export function ImageFieldWithPicker({
  value,
  onChange,
  label,
  placeholder = 'Image URL',
  buttonText = 'Choose from Library',
}: ImageFieldWithPickerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleClear = () => {
    onChange('');
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex gap-2">
        <div className="flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 whitespace-nowrap"
        >
          {buttonText}
        </button>
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 whitespace-nowrap"
          >
            Clear
          </button>
        )}
      </div>
      {value && (
        <div className="mt-2">
          <div className="relative inline-block">
            <img
              src={value}
              alt="Preview"
              className="h-20 w-auto border border-gray-300 rounded"
              onError={(e) => {
                // Hide broken images
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        </div>
      )}
      <ImagePickerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={onChange}
        currentValue={value}
      />
    </div>
  );
}
