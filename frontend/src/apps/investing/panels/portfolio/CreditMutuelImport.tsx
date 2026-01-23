import { useState, useRef } from 'react';
import { Upload, FileText, X, Check, AlertCircle, Loader2, Trash2, ChevronRight, ChevronLeft, Eye } from 'lucide-react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useLanguage } from '../../../../contexts/LanguageContext';

// Import screenshots as static assets
import step1Image from '../../../../assets/cm-import/step1.png';
import step2Image from '../../../../assets/cm-import/step2.png';
import step3Image from '../../../../assets/cm-import/step3.png';
import step4Image from '../../../../assets/cm-import/step4.png';
import step5Image from '../../../../assets/cm-import/step5.png';

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

  // Wizard step (1-6, where 6 is upload)
  const [step, setStep] = useState(1);

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<number>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [excelData, setExcelData] = useState<string[][]>([]);
  const [showExcelPreview, setShowExcelPreview] = useState(false);


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
    const isExcel = droppedFile?.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                    droppedFile?.name?.endsWith('.xlsx');
    if (isExcel) {
      handleFileSelect(droppedFile);
    } else {
      setParseError(language === 'fr' ? 'Veuillez sélectionner un fichier Excel (.xlsx)' : 'Please select an Excel file (.xlsx)');
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setParseError(null);
    setParsedTransactions([]);
    setSelectedTransactions(new Set());
    setExcelData([]);
    setIsParsing(true);

    // Parse Excel for preview
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });
      setExcelData(data.slice(3, 103)); // Skip first 3 rows, limit to 100 rows
    } catch {
      // Silently fail preview parsing - main parsing will handle errors
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post('/api/investing/import/credit-mutuel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.success && response.data.transactions.length > 0) {
        // Filter out OAT (French government bonds) - pattern like "OAT 8,50%92-25042023"
        const filteredTransactions = response.data.transactions.filter(
          (tx: ParsedTransaction) => !/^OAT.*%/i.test(tx.stock_ticker)
        );
        setParsedTransactions(filteredTransactions);
        setSelectedTransactions(new Set(filteredTransactions.map((_: ParsedTransaction, i: number) => i)));
      } else if (response.data.transactions.length === 0) {
        setParseError(language === 'fr'
          ? 'Aucune transaction trouvée dans ce fichier. Assurez-vous d\'utiliser un export Crédit Mutuel.'
          : 'No transactions found in this file. Make sure you\'re using a Crédit Mutuel export.');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setParseError(err.response?.data?.error || (language === 'fr' ? 'Erreur lors de l\'analyse du fichier' : 'Failed to parse file'));
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
          price_per_share: tx.price_per_share,
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
    setExcelData([]);
    setShowExcelPreview(false);
    setStep(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Step content
  const steps = [
    {
      titleFr: 'Connectez-vous à votre espace Crédit Mutuel',
      titleEn: 'Log into your Crédit Mutuel account',
      descFr: 'Rendez-vous sur le site de votre Crédit Mutuel et connectez-vous.',
      descEn: 'Go to your Crédit Mutuel website and log in.',
      image: step1Image,
    },
    {
      titleFr: 'Accédez à Opérations → Valeurs boursières',
      titleEn: 'Go to Opérations → Valeurs boursières',
      descFr: 'Dans le menu principal, cliquez sur "Opérations" puis "Valeurs boursières".',
      descEn: 'In the main menu, click "Opérations" then "Valeurs boursières".',
      image: step2Image,
    },
    {
      titleFr: 'Cliquez sur Portefeuilles',
      titleEn: 'Click on Portefeuilles',
      descFr: 'Dans l\'espace bourse, sélectionnez l\'onglet "Portefeuilles".',
      descEn: 'In the bourse section, select the "Portefeuilles" tab.',
      image: step3Image,
    },
    {
      titleFr: 'Accédez à Historique opérations → Bourse',
      titleEn: 'Go to Historique opérations → Bourse',
      descFr: 'Sélectionnez "Historique opérations", puis "Bourse". Entrez les dates souhaitées et cliquez OK.',
      descEn: 'Select "Historique opérations", then "Bourse". Enter your desired dates and click OK.',
      image: step4Image,
    },
    {
      titleFr: 'Téléchargez le fichier Excel',
      titleEn: 'Download the Excel file',
      descFr: 'Cliquez sur l\'icône de téléchargement en haut à droite pour obtenir le fichier .xlsx.',
      descEn: 'Click the download icon on the top right to get the .xlsx file.',
      image: step5Image,
    },
  ];

  const currentStepData = steps[step - 1];
  const isLastInstructionStep = step === 5;
  const isUploadStep = step === 6;

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
              {isUploadStep
                ? (language === 'fr' ? 'Uploadez votre relevé' : 'Upload your statement')
                : (language === 'fr' ? `Étape ${step}/5` : `Step ${step}/5`)}
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

      {/* Progress bar for instruction steps - clickable */}
      {!isUploadStep && !parsedTransactions.length && (
        <>
          <div className="flex gap-1 mb-4">
            {[1, 2, 3, 4, 5].map(s => (
              <button
                key={s}
                onClick={() => setStep(s)}
                className={`h-2 flex-1 rounded-full transition-colors hover:opacity-80 ${
                  s <= step ? 'bg-green-500' : 'bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500'
                }`}
                title={language === 'fr' ? `Étape ${s}` : `Step ${s}`}
              />
            ))}
          </div>
          {/* Warning shown on all steps */}
          <div className="p-3 mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-700 dark:text-amber-400">
            ⚠️ {language === 'fr'
              ? 'Seules les opérations depuis 2024 sont disponibles sur le site. Les opérations antérieures doivent être ajoutées manuellement.'
              : 'Only operations since 2024 are available on the site. Earlier operations must be added manually.'}
          </div>
        </>
      )}

      {/* Instruction Steps (1-5) */}
      {!isUploadStep && !parsedTransactions.length && !parseError && (
        <div className="space-y-4">
          <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-100 text-center">
            {language === 'fr' ? currentStepData.titleFr : currentStepData.titleEn}
          </h4>
          <p className="text-slate-800 dark:text-slate-100 text-center">
            {language === 'fr' ? currentStepData.descFr : currentStepData.descEn}
          </p>

          {/* Navigation buttons */}
          <div className="flex justify-between py-4">
            <button
              onClick={() => setStep(s => Math.max(1, s - 1))}
              disabled={step === 1}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              {language === 'fr' ? 'Précédent' : 'Previous'}
            </button>
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              {isLastInstructionStep
                ? (language === 'fr' ? 'J\'ai le fichier' : 'I have the file')
                : (language === 'fr' ? 'Suivant' : 'Next')}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {currentStepData.image && (
            <div className={`rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 ${[1, 2, 5].includes(step) ? 'max-h-96' : ''}`}>
              <img
                src={currentStepData.image}
                alt={language === 'fr' ? currentStepData.titleFr : currentStepData.titleEn}
                className={`w-full ${[1, 2, 5].includes(step) ? 'object-contain max-h-96' : ''}`}
              />
            </div>
          )}
        </div>
      )}

      {/* Upload Step (6) */}
      {isUploadStep && !file && !isParsing && !parsedTransactions.length && !parseError && (
        <>
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
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileInputChange}
              className="hidden"
            />
            <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-green-500' : 'text-slate-400'}`} />
            <p className="text-slate-600 dark:text-slate-300 font-medium mb-2">
              {language === 'fr' ? 'Glissez votre fichier Excel ici' : 'Drag your Excel file here'}
            </p>
            <p className="text-slate-400 text-sm">
              {language === 'fr' ? 'ou cliquez pour sélectionner (.xlsx)' : 'or click to select (.xlsx)'}
            </p>
          </div>

          <div className="flex justify-start mt-4">
            <button
              onClick={() => setStep(5)}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
            >
              <ChevronLeft className="w-4 h-4" />
              {language === 'fr' ? 'Revoir les instructions' : 'Review instructions'}
            </button>
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
              <button
                onClick={() => excelData.length > 0 && setShowExcelPreview(true)}
                className={`text-slate-600 dark:text-slate-300 font-medium flex items-center gap-1 ${excelData.length > 0 ? 'hover:text-green-600 dark:hover:text-green-400 cursor-pointer' : ''}`}
                disabled={excelData.length === 0}
              >
                {file?.name || (language === 'fr' ? 'Uploadé depuis le téléphone' : 'Uploaded from phone')}
                {excelData.length > 0 && <Eye className="w-4 h-4 ml-1" />}
              </button>
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
                    <th className="p-3 w-28">{language === 'fr' ? 'Action' : 'Stock'}</th>
                    <th className="p-3 w-24">{language === 'fr' ? 'Type' : 'Type'}</th>
                    <th className="p-3 w-24 text-center">{language === 'fr' ? 'Quantité' : 'Quantity'}</th>
                    <th className="p-3 w-28 text-right">{language === 'fr' ? 'Prix' : 'Price'}</th>
                    <th className="p-3 w-32">Date</th>
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
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          value={tx.quantity}
                          onChange={(e) => updateTransaction(i, 'quantity', e.target.value)}
                          min="0"
                          step="any"
                          className="w-20 px-2 py-1 text-center text-slate-600 dark:text-slate-300 bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-500 focus:border-green-500 dark:focus:border-green-400 rounded focus:outline-none"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <span className="text-slate-600 dark:text-slate-300">
                          {tx.price_per_share !== null ? `€${tx.price_per_share.toFixed(2)}` : '-'}
                        </span>
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

      {/* Excel Preview Overlay */}
      {showExcelPreview && excelData.length > 0 && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowExcelPreview(false)}>
          <div
            className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-green-500" />
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {file?.name}
                </span>
                <span className="text-sm text-slate-500">
                  ({excelData.length} {language === 'fr' ? 'lignes' : 'rows'})
                </span>
              </div>
              <button
                onClick={() => setShowExcelPreview(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-sm border-collapse">
                <tbody>
                  {excelData.map((row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      className={rowIdx === 0 ? 'bg-slate-100 dark:bg-slate-700 font-semibold' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}
                    >
                      <td className="px-2 py-1 text-slate-400 text-xs w-10 text-right border-r border-slate-200 dark:border-slate-600">
                        {rowIdx + 1}
                      </td>
                      {row.map((cell, colIdx) => (
                        <td
                          key={colIdx}
                          className="px-3 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 whitespace-nowrap"
                        >
                          {cell !== null && cell !== undefined ? String(cell) : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
