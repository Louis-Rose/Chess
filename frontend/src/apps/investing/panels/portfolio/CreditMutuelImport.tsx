import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, FileText, X, Check, AlertCircle, Loader2, Trash2, Smartphone, Monitor } from 'lucide-react';
import axios from 'axios';
import { useLanguage } from '../../../../contexts/LanguageContext';

interface ParsedTransaction {
  stock_ticker: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  transaction_date: string;
  price_per_share: number | null;
}

interface CreditMutuelImportProps {
  selectedAccountId: number | undefined;
  onImportComplete: () => void;
  onClose: () => void;
}

export function CreditMutuelImport({ selectedAccountId, onImportComplete, onClose }: CreditMutuelImportProps) {
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mode: 'choose' | 'desktop' | 'qr'
  const [mode, setMode] = useState<'choose' | 'desktop' | 'qr'>('choose');

  // QR code state
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Direct upload state
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<number>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importErrors, setImportErrors] = useState<string[]>([]);

  // Generate QR token
  const generateQrToken = useCallback(async () => {
    setIsGeneratingToken(true);
    try {
      const response = await axios.post('/api/investing/import/create-token');
      setQrToken(response.data.token);
      setIsPolling(true);
    } catch {
      setParseError(language === 'fr' ? 'Erreur lors de la génération du QR code' : 'Failed to generate QR code');
    } finally {
      setIsGeneratingToken(false);
    }
  }, [language]);

  // Poll for upload status
  useEffect(() => {
    if (!isPolling || !qrToken) return;

    const pollStatus = async () => {
      try {
        const response = await axios.get(`/api/investing/import/status/${qrToken}`);
        if (response.data.status === 'uploaded') {
          setIsPolling(false);
          if (response.data.transactions.length === 0) {
            setParseError(language === 'fr'
              ? 'Aucune transaction trouvée dans ce PDF. Assurez-vous d\'utiliser un relevé de compte-titres Crédit Mutuel.'
              : 'No transactions found in this PDF. Make sure you\'re using a Crédit Mutuel securities statement.');
          } else {
            setParsedTransactions(response.data.transactions);
            setSelectedTransactions(new Set(response.data.transactions.map((_: ParsedTransaction, i: number) => i)));
          }
        } else if (response.data.status === 'error') {
          setIsPolling(false);
          setParseError(response.data.error);
        }
      } catch {
        // Token might have expired
        setIsPolling(false);
        setParseError(language === 'fr' ? 'Le lien a expiré' : 'Link expired');
      }
    };

    // Check immediately, then poll every 2 seconds
    pollStatus();
    pollingRef.current = setInterval(pollStatus, 2000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isPolling, qrToken, language]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Start QR mode
  const startQrMode = () => {
    setMode('qr');
    generateQrToken();
  };

  // Get QR code URL
  const getQrCodeUrl = () => {
    if (!qrToken) return '';
    const uploadUrl = `${window.location.origin}/upload/${qrToken}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uploadUrl)}`;
  };

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
      setParseError(language === 'fr' ? 'Veuillez sélectionner un fichier PDF' : 'Please select a PDF file');
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setParseError(null);
    setParsedTransactions([]);
    setSelectedTransactions(new Set());
    setIsParsing(true);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post('/api/investing/import/revolut', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.success && response.data.transactions.length > 0) {
        setParsedTransactions(response.data.transactions);
        // Select all by default
        setSelectedTransactions(new Set(response.data.transactions.map((_: ParsedTransaction, i: number) => i)));
      } else if (response.data.transactions.length === 0) {
        setParseError(language === 'fr'
          ? 'Aucune transaction trouvée dans ce PDF. Assurez-vous d\'utiliser un relevé de compte-titres Crédit Mutuel.'
          : 'No transactions found in this PDF. Make sure you\'re using a Crédit Mutuel securities statement.');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setParseError(err.response?.data?.error || (language === 'fr' ? 'Erreur lors de l\'analyse du PDF' : 'Failed to parse PDF'));
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const toggleTransaction = (index: number) => {
    const newSelected = new Set(selectedTransactions);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTransactions(newSelected);
  };

  const toggleAll = () => {
    if (selectedTransactions.size === parsedTransactions.length) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(new Set(parsedTransactions.map((_, i) => i)));
    }
  };

  const updateTransaction = (index: number, field: keyof ParsedTransaction, value: string | number) => {
    setParsedTransactions(prev => {
      const updated = [...prev];
      if (field === 'quantity') {
        updated[index] = { ...updated[index], [field]: Number(value) || 0 };
      } else if (field === 'transaction_type') {
        updated[index] = { ...updated[index], [field]: value as 'BUY' | 'SELL' };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };

  const handleImport = async () => {
    const toImport = parsedTransactions.filter((_, i) => selectedTransactions.has(i));
    if (toImport.length === 0) return;

    setIsImporting(true);
    setImportProgress({ current: 0, total: toImport.length });
    setImportErrors([]);

    const errors: string[] = [];

    for (let i = 0; i < toImport.length; i++) {
      const tx = toImport[i];
      try {
        await axios.post('/api/investing/transactions', {
          stock_ticker: tx.stock_ticker,
          transaction_type: tx.transaction_type,
          quantity: tx.quantity,
          transaction_date: tx.transaction_date,
          account_id: selectedAccountId,
        });
      } catch (error: unknown) {
        const err = error as { response?: { data?: { error?: string } } };
        errors.push(`${tx.stock_ticker} (${tx.transaction_date}): ${err.response?.data?.error || 'Failed'}`);
      }
      setImportProgress({ current: i + 1, total: toImport.length });
    }

    setImportErrors(errors);
    setIsImporting(false);

    if (errors.length === 0) {
      onImportComplete();
    }
  };

  const reset = () => {
    setFile(null);
    setParsedTransactions([]);
    setSelectedTransactions(new Set());
    setParseError(null);
    setImportErrors([]);
    setMode('choose');
    setQrToken(null);
    setIsPolling(false);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-600">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#0b4a3e] flex items-center justify-center">
            <span className="text-white font-bold text-lg">CM</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {language === 'fr' ? 'Import Crédit Mutuel' : 'Crédit Mutuel Import'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {language === 'fr' ? 'Importer depuis un relevé de compte-titres PDF' : 'Import from securities statement PDF'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Mode Selection */}
      {mode === 'choose' && !parseError && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-4">
            {language === 'fr' ? 'Comment souhaitez-vous importer ?' : 'How would you like to import?'}
          </p>
          <button
            onClick={startQrMode}
            className="w-full flex items-center gap-4 p-4 border border-slate-200 dark:border-slate-600 rounded-xl hover:border-green-400 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
          >
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
              <Smartphone className="w-6 h-6 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="text-left">
              <p className="font-medium text-slate-800 dark:text-slate-100">
                {language === 'fr' ? 'Depuis mon téléphone' : 'From my phone'}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {language === 'fr' ? 'Scanner un QR code pour uploader' : 'Scan QR code to upload'}
              </p>
            </div>
          </button>
          <button
            onClick={() => setMode('desktop')}
            className="w-full flex items-center gap-4 p-4 border border-slate-200 dark:border-slate-600 rounded-xl hover:border-green-400 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
          >
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
              <Monitor className="w-6 h-6 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="text-left">
              <p className="font-medium text-slate-800 dark:text-slate-100">
                {language === 'fr' ? 'Depuis cet ordinateur' : 'From this computer'}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {language === 'fr' ? 'J\'ai le PDF sur cet appareil' : 'I have the PDF on this device'}
              </p>
            </div>
          </button>
        </div>
      )}

      {/* QR Code Mode */}
      {mode === 'qr' && !parsedTransactions.length && (
        <div className="text-center py-4">
          {isGeneratingToken ? (
            <div className="py-8">
              <Loader2 className="w-10 h-10 text-green-500 animate-spin mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-300">
                {language === 'fr' ? 'Génération du QR code...' : 'Generating QR code...'}
              </p>
            </div>
          ) : qrToken ? (
            <>
              {/* Instructions */}
              <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-left">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 font-medium">
                  {language === 'fr' ? 'Comment obtenir votre relevé Crédit Mutuel :' : 'How to get your Crédit Mutuel statement:'}
                </p>
                <ol className="text-sm text-slate-500 dark:text-slate-400 space-y-1 list-decimal list-inside">
                  <li>{language === 'fr' ? 'Connectez-vous à votre espace Crédit Mutuel' : 'Log into your Crédit Mutuel account'}</li>
                  <li>{language === 'fr' ? 'Allez dans Bourse → Portefeuille' : 'Go to Bourse → Portfolio'}</li>
                  <li>{language === 'fr' ? 'Cliquez sur Historique des opérations' : 'Click on Transaction History'}</li>
                  <li>{language === 'fr' ? 'Exportez en PDF et uploadez via le QR code' : 'Export as PDF and upload via QR code'}</li>
                </ol>
              </div>

              <p className="text-slate-600 dark:text-slate-300 mb-4">
                {language === 'fr' ? 'Scannez ce QR code avec votre téléphone' : 'Scan this QR code with your phone'}
              </p>
              <div className="inline-block p-4 bg-white rounded-xl shadow-lg mb-4">
                <img src={getQrCodeUrl()} alt="QR Code" className="w-48 h-48" />
              </div>
              <div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{language === 'fr' ? 'En attente de l\'upload...' : 'Waiting for upload...'}</span>
              </div>
              <p className="text-slate-400 text-xs mt-4">
                {language === 'fr' ? 'Le lien expire dans 5 minutes' : 'Link expires in 5 minutes'}
              </p>
              <button
                onClick={() => { setMode('choose'); setQrToken(null); setIsPolling(false); }}
                className="mt-4 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm underline"
              >
                {language === 'fr' ? 'Annuler' : 'Cancel'}
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* Upload Area (Desktop mode) */}
      {mode === 'desktop' && !file && !isParsing && !parsedTransactions.length && (
        <>
          {/* Instructions */}
          <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 font-medium">
              {language === 'fr' ? 'Comment obtenir votre relevé Crédit Mutuel :' : 'How to get your Crédit Mutuel statement:'}
            </p>
            <ol className="text-sm text-slate-500 dark:text-slate-400 space-y-1 list-decimal list-inside">
              <li>{language === 'fr' ? 'Connectez-vous à votre espace Crédit Mutuel' : 'Log into your Crédit Mutuel account'}</li>
              <li>{language === 'fr' ? 'Allez dans Bourse → Portefeuille' : 'Go to Bourse → Portfolio'}</li>
              <li>{language === 'fr' ? 'Cliquez sur Historique des opérations' : 'Click on Transaction History'}</li>
              <li>{language === 'fr' ? 'Exportez le relevé en PDF' : 'Export the statement as PDF'}</li>
            </ol>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                : 'border-slate-300 dark:border-slate-600 hover:border-green-400 dark:hover:border-green-500'
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
            <p className="text-slate-600 dark:text-slate-300 font-medium mb-2">
              {language === 'fr' ? 'Glissez votre PDF ici' : 'Drag your PDF here'}
            </p>
            <p className="text-slate-400 text-sm">
              {language === 'fr' ? 'ou cliquez pour sélectionner' : 'or click to select'}
            </p>
          </div>
        </>
      )}

      {/* Parsing State */}
      {isParsing && (
        <div className="text-center py-8">
          <Loader2 className="w-10 h-10 text-green-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-300">
            {language === 'fr' ? 'Analyse du PDF...' : 'Parsing PDF...'}
          </p>
        </div>
      )}

      {/* Parse Error */}
      {parseError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-700 dark:text-red-400">{parseError}</p>
              <button
                onClick={reset}
                className="text-red-600 dark:text-red-400 text-sm underline mt-2"
              >
                {language === 'fr' ? 'Réessayer' : 'Try again'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parsed Transactions */}
      {parsedTransactions.length > 0 && !isImporting && importErrors.length === 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-500" />
              <span className="text-slate-600 dark:text-slate-300 font-medium">
                {file?.name || (language === 'fr' ? 'Uploadé depuis le téléphone' : 'Uploaded from phone')}
              </span>
              <button onClick={reset} className="text-slate-400 hover:text-red-500 p-1">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={toggleAll}
              className="text-sm text-green-600 hover:text-green-700 dark:text-green-400"
            >
              {selectedTransactions.size === parsedTransactions.length
                ? (language === 'fr' ? 'Tout désélectionner' : 'Deselect all')
                : (language === 'fr' ? 'Tout sélectionner' : 'Select all')}
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden mb-4">
            <div className="max-h-[300px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700 sticky top-0">
                  <tr className="text-left text-slate-600 dark:text-slate-300">
                    <th className="p-3 w-10"></th>
                    <th className="p-3">{language === 'fr' ? 'Action' : 'Stock'}</th>
                    <th className="p-3">{language === 'fr' ? 'Type' : 'Type'}</th>
                    <th className="p-3 text-right">{language === 'fr' ? 'Qté' : 'Qty'}</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedTransactions.map((tx, i) => (
                    <tr
                      key={i}
                      className={`border-t border-slate-100 dark:border-slate-700 transition-colors ${
                        selectedTransactions.has(i)
                          ? 'bg-green-50 dark:bg-green-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      <td className="p-3 cursor-pointer" onClick={() => toggleTransaction(i)}>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          selectedTransactions.has(i)
                            ? 'bg-green-500 border-green-500'
                            : 'border-slate-300 dark:border-slate-500'
                        }`}>
                          {selectedTransactions.has(i) && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={tx.stock_ticker}
                          onChange={(e) => updateTransaction(i, 'stock_ticker', e.target.value.toUpperCase())}
                          className="w-full px-2 py-1 font-bold text-slate-800 dark:text-slate-100 bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-500 focus:border-green-500 dark:focus:border-green-400 rounded focus:outline-none"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={tx.transaction_type}
                          onChange={(e) => updateTransaction(i, 'transaction_type', e.target.value)}
                          className={`px-2 py-1 rounded text-xs font-bold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 ${
                            tx.transaction_type === 'BUY'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
                          }`}
                        >
                          <option value="BUY">BUY</option>
                          <option value="SELL">SELL</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={tx.quantity}
                          onChange={(e) => updateTransaction(i, 'quantity', e.target.value)}
                          min="0"
                          step="any"
                          className="w-20 px-2 py-1 text-right text-slate-600 dark:text-slate-300 bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-500 focus:border-green-500 dark:focus:border-green-400 rounded focus:outline-none"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="date"
                          value={tx.transaction_date}
                          onChange={(e) => updateTransaction(i, 'transaction_date', e.target.value)}
                          className="px-2 py-1 text-slate-500 dark:text-slate-400 bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-500 focus:border-green-500 dark:focus:border-green-400 rounded focus:outline-none"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {selectedTransactions.size} / {parsedTransactions.length} {language === 'fr' ? 'sélectionnées' : 'selected'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                {language === 'fr' ? 'Annuler' : 'Cancel'}
              </button>
              <button
                onClick={handleImport}
                disabled={selectedTransactions.size === 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {language === 'fr' ? 'Importer' : 'Import'} ({selectedTransactions.size})
              </button>
            </div>
          </div>
        </>
      )}

      {/* Import Progress */}
      {isImporting && (
        <div className="text-center py-8">
          <Loader2 className="w-10 h-10 text-green-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-300 mb-2">
            {language === 'fr' ? 'Import en cours...' : 'Importing...'}
          </p>
          <p className="text-slate-500 text-sm">
            {importProgress.current} / {importProgress.total}
          </p>
          <div className="w-48 mx-auto mt-3 h-2 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Import Errors */}
      {importErrors.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-700 dark:text-amber-400 font-medium mb-2">
                {language === 'fr'
                  ? `${importProgress.total - importErrors.length} transactions importées, ${importErrors.length} erreurs`
                  : `${importProgress.total - importErrors.length} imported, ${importErrors.length} errors`}
              </p>
              <ul className="text-amber-600 dark:text-amber-400 text-sm space-y-1">
                {importErrors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {importErrors.length > 5 && (
                  <li>... {language === 'fr' ? `et ${importErrors.length - 5} autres` : `and ${importErrors.length - 5} more`}</li>
                )}
              </ul>
              <button
                onClick={onImportComplete}
                className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
              >
                {language === 'fr' ? 'Terminer' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
