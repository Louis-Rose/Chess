import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Upload, Check, AlertCircle, Loader2, FileText } from 'lucide-react';
import axios from 'axios';

export function MobileUpload() {
  const { token } = useParams<{ token: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [transactionCount, setTransactionCount] = useState(0);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === 'application/pdf') {
      handleFileSelect(droppedFile);
    } else {
      setUploadError('Please select a PDF file');
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setUploadError(null);
    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post(`/api/investing/import/upload/${token}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.success) {
        setUploadSuccess(true);
        setTransactionCount(response.data.count);
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setUploadError(err.response?.data?.error || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-6 shadow-lg max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-800 mb-2">Invalid Link</h1>
          <p className="text-slate-600">This upload link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  if (uploadSuccess) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-6 shadow-lg max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Upload Complete!</h1>
          <p className="text-slate-600 mb-4">
            {transactionCount} transaction{transactionCount !== 1 ? 's' : ''} found.
          </p>
          <p className="text-slate-500 text-sm">
            Return to your computer to review and import the transactions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-6 shadow-lg max-w-md w-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[#0666eb] flex items-center justify-center">
            <span className="text-white font-bold text-lg">R</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Revolut Import</h1>
            <p className="text-sm text-slate-500">Upload your trading statement</p>
          </div>
        </div>

        {/* Upload Area */}
        {!isUploading && !uploadError && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-green-500 bg-green-50'
                : 'border-slate-300 hover:border-green-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileInputChange}
              className="hidden"
            />
            <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-green-500' : 'text-slate-400'}`} />
            <p className="text-slate-600 font-medium mb-2">Tap to select PDF</p>
            <p className="text-slate-400 text-sm">or drag and drop</p>
          </div>
        )}

        {/* Uploading State */}
        {isUploading && (
          <div className="text-center py-8">
            <Loader2 className="w-10 h-10 text-green-500 animate-spin mx-auto mb-4" />
            <p className="text-slate-600">Uploading and parsing...</p>
            {file && (
              <div className="flex items-center justify-center gap-2 mt-2 text-slate-500 text-sm">
                <FileText className="w-4 h-4" />
                <span>{file.name}</span>
              </div>
            )}
          </div>
        )}

        {/* Error State */}
        {uploadError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-700">{uploadError}</p>
                <button
                  onClick={() => {
                    setUploadError(null);
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-red-600 text-sm underline mt-2"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-6 p-4 bg-slate-50 rounded-lg">
          <p className="text-sm text-slate-600 mb-2 font-medium">How to get your statement:</p>
          <ol className="text-sm text-slate-500 space-y-1 list-decimal list-inside">
            <li>Revolut app → Invest tab</li>
            <li>Tap ... (More) → Documents</li>
            <li>Brokerage account → Account statement</li>
            <li>Period: Since the beginning → Download PDF</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
