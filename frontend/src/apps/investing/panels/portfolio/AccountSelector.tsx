import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Minus, Trash2, Loader2, Building2, Wallet, GripVertical, Copy, Pencil } from 'lucide-react';
import { useLanguage } from '../../../../contexts/LanguageContext';
import type { Account, BankInfo, AccountTypeInfo } from './types';
import { FeesDisplay } from './FeesDisplay';

interface CardPosition {
  id: number;
  x: number;
  y: number;
}

interface AccountSelectorProps {
  accounts: Account[];
  selectedAccountIds: number[];
  onToggleAccount: (id: number) => void;
  banks: Record<string, BankInfo>;
  accountTypes: Record<string, AccountTypeInfo>;
  onCreateAccount: (data: { name: string; account_type: string; bank: string }) => void;
  onDeleteAccount: (id: number) => void;
  onDuplicateAccount: (id: number) => void;
  onRenameAccount: (id: number, name: string) => void;
  onReorderAccounts: (accountIds: number[]) => void;
  isCreating: boolean;
  isDeleting: boolean;
  isDuplicating: boolean;
  isRenaming: boolean;
}

export function AccountSelector({
  accounts,
  selectedAccountIds,
  onToggleAccount,
  banks,
  accountTypes,
  onCreateAccount,
  onDeleteAccount,
  onDuplicateAccount,
  onRenameAccount,
  onReorderAccounts,
  isCreating,
  isDeleting,
  isDuplicating,
  isRenaming,
}: AccountSelectorProps) {
  const { language, t } = useLanguage();

  const [showAccounts, setShowAccounts] = useState(true);
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('');
  const [newAccountBank, setNewAccountBank] = useState('');
  const [accountPendingDelete, setAccountPendingDelete] = useState<number | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<number | null>(null);
  const [draggedAccountId, setDraggedAccountId] = useState<number | null>(null);
  const [dragOverAccountId, setDragOverAccountId] = useState<number | null>(null);
  const [waitingForNewAccount, setWaitingForNewAccount] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; accountId: number } | null>(null);
  const [renamingAccountId, setRenamingAccountId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const expectedAccountCount = useRef<number>(0);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const initialPositions = useRef<CardPosition[]>([]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Don't close if clicking inside the context menu
      if (contextMenuRef.current && contextMenuRef.current.contains(e.target as Node)) {
        return;
      }
      setContextMenu(null);
    };
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  // Focus rename input when shown
  useEffect(() => {
    if (renamingAccountId !== null && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingAccountId]);

  // Clear rename state when rename completes
  useEffect(() => {
    if (!isRenaming && renamingAccountId !== null) {
      // Check if the account name was updated
      const account = accounts.find(a => a.id === renamingAccountId);
      if (account && account.name === renameValue.trim()) {
        setRenamingAccountId(null);
        setRenameValue('');
      }
    }
  }, [isRenaming, accounts, renamingAccountId, renameValue]);

  // Clear pending delete when clicking outside
  useEffect(() => {
    if (accountPendingDelete !== null) {
      const timer = setTimeout(() => setAccountPendingDelete(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [accountPendingDelete]);

  // Clear deletingAccountId when account is actually removed from the list
  useEffect(() => {
    if (deletingAccountId !== null) {
      const accountStillExists = accounts.some(a => a.id === deletingAccountId);
      if (!accountStillExists) {
        setDeletingAccountId(null);
      }
    }
  }, [accounts, deletingAccountId]);

  // Clear waitingForNewAccount when account actually appears in the list
  useEffect(() => {
    if (waitingForNewAccount && accounts.length >= expectedAccountCount.current) {
      setWaitingForNewAccount(false);
      setShowAddAccountForm(false);
    }
  }, [accounts.length, waitingForNewAccount]);

  // Handle rename submission
  const handleRenameSubmit = () => {
    if (renamingAccountId !== null && renameValue.trim()) {
      onRenameAccount(renamingAccountId, renameValue.trim());
    }
  };

  const handleRenameCancel = () => {
    setRenamingAccountId(null);
    setRenameValue('');
  };

  const startRenaming = (accountId: number) => {
    const account = accounts.find(a => a.id === accountId);
    if (account) {
      setRenamingAccountId(accountId);
      setRenameValue(account.name);
    }
  };

  // Find first unused account number based on existing names
  const getNextAccountNumber = () => {
    const prefix = language === 'fr' ? 'COMPTE ' : 'ACCOUNT ';
    const usedNumbers = new Set<number>();

    accounts.forEach(account => {
      const match = account.name.match(/^(?:COMPTE|ACCOUNT)\s+(\d+)$/i);
      if (match) {
        usedNumbers.add(parseInt(match[1], 10));
      }
    });

    let num = 1;
    while (usedNumbers.has(num)) {
      num++;
    }
    return `${prefix}${num}`;
  };

  const handleCreateAccount = () => {
    if (newAccountType && newAccountBank) {
      const defaultName = getNextAccountNumber();
      const accountName = newAccountName.trim() || defaultName;

      // Track that we're waiting for the new account to appear
      expectedAccountCount.current = accounts.length + 1;
      setWaitingForNewAccount(true);

      onCreateAccount({
        name: accountName,
        account_type: newAccountType,
        bank: newAccountBank,
      });
      setNewAccountName('');
      setNewAccountType('');
      setNewAccountBank('');
      // Don't close form here - it will close when account appears
    }
  };

  // Capture card positions on drag start
  const capturePositions = useCallback(() => {
    const positions: CardPosition[] = [];
    cardRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect();
      positions.push({ id, x: rect.left, y: rect.top });
    });
    initialPositions.current = positions;
  }, []);

  // Calculate transform for an account based on preview position
  const getTransform = useCallback((accountId: number, originalIndex: number): { x: number; y: number } => {
    if (draggedAccountId === null || dragOverAccountId === null) {
      return { x: 0, y: 0 };
    }

    const draggedIndex = accounts.findIndex(a => a.id === draggedAccountId);
    const targetIndex = accounts.findIndex(a => a.id === dragOverAccountId);

    if (draggedIndex === -1 || targetIndex === -1) return { x: 0, y: 0 };

    // Calculate what the visual index should be
    let visualIndex = originalIndex;
    if (accountId === draggedAccountId) {
      visualIndex = targetIndex;
    } else if (draggedIndex < targetIndex) {
      if (originalIndex > draggedIndex && originalIndex <= targetIndex) {
        visualIndex = originalIndex - 1;
      }
    } else if (draggedIndex > targetIndex) {
      if (originalIndex >= targetIndex && originalIndex < draggedIndex) {
        visualIndex = originalIndex + 1;
      }
    }

    if (visualIndex === originalIndex) return { x: 0, y: 0 };

    // Get positions from initial capture
    const currentPos = initialPositions.current.find(p => p.id === accountId);
    // Find the account that is currently at visualIndex and get its position
    const accountAtVisualIndex = accounts[visualIndex];
    const targetPos = accountAtVisualIndex
      ? initialPositions.current.find(p => p.id === accountAtVisualIndex.id)
      : null;

    if (!currentPos || !targetPos) return { x: 0, y: 0 };

    return {
      x: targetPos.x - currentPos.x,
      y: targetPos.y - currentPos.y,
    };
  }, [draggedAccountId, dragOverAccountId, accounts]);

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, accountId: number, node: HTMLDivElement) => {
    capturePositions();
    setDraggedAccountId(accountId);
    dragNodeRef.current = node;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', accountId.toString());
    // Add a slight delay to allow the drag image to be captured
    setTimeout(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.style.opacity = '0.4';
        dragNodeRef.current.style.pointerEvents = 'none';
      }
    }, 0);
  };

  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1';
      dragNodeRef.current.style.pointerEvents = '';
    }
    setDraggedAccountId(null);
    setDragOverAccountId(null);
    dragNodeRef.current = null;
  };

  const handleDragOver = (e: React.DragEvent, accountId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (accountId !== draggedAccountId && dragOverAccountId !== accountId) {
      setDragOverAccountId(accountId);
    }
  };

  // Container-level drop handler - uses tracked dragOverAccountId
  const handleContainerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragOverAccountId !== null) {
      handleDrop(e, dragOverAccountId);
    } else {
      handleDragEnd();
    }
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetAccountId: number) => {
    e.preventDefault();

    const draggedId = draggedAccountId;

    // Reset all drag state immediately
    handleDragEnd();

    if (draggedId === null || draggedId === targetAccountId) {
      return;
    }

    // Reorder accounts
    const newOrder = [...accounts];
    const draggedIndex = newOrder.findIndex(a => a.id === draggedId);
    const targetIndex = newOrder.findIndex(a => a.id === targetAccountId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const [draggedAccount] = newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedAccount);
      onReorderAccounts(newOrder.map(a => a.id));
    }
  };

  const selectedAccounts = accounts.filter(a => selectedAccountIds.includes(a.id));

  return (
    <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6">
      {/* Toggle button - centered */}
      <div className="flex justify-center mb-4">
        <button
          onClick={(e) => {
            setShowAccounts(!showAccounts);
            setTimeout(() => e.currentTarget?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 10);
          }}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
        >
          {showAccounts ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showAccounts
            ? (language === 'fr' ? 'Masquer comptes' : 'Hide accounts')
            : (language === 'fr' ? 'Afficher comptes' : 'Show accounts')}
        </button>
      </div>

      {showAccounts && (
        <>
          {/* Header with title and add button */}
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('accounts.title')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedAccountIds.length > 1
                    ? (language === 'fr'
                        ? 'Sélectionnez un seul compte pour ajouter des transactions'
                        : 'Select a single account to add transactions')
                    : (language === 'fr'
                        ? 'Sélectionnez plusieurs comptes pour voir les données agrégées'
                        : 'Select multiple accounts to see combined data')}
                </p>
              </div>
            </div>
            {!showAddAccountForm && (
              <button
                onClick={() => {
                  setNewAccountBank('');
                  setNewAccountType('');
                  setNewAccountName('');
                  setShowAddAccountForm(true);
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                {t('accounts.addAccount')}
              </button>
            )}
          </div>

          {/* Add Account Form */}
          {showAddAccountForm && (
            <div className="bg-white rounded-lg p-4 mb-4 border border-slate-200">
              <div className="flex gap-3 flex-wrap items-end">
                <div className="min-w-[180px]">
                  <label className="block text-sm font-medium text-slate-600 mb-1">{t('accounts.bank')}</label>
                  <select
                    value={newAccountBank}
                    onChange={(e) => setNewAccountBank(e.target.value)}
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-500 ${newAccountBank ? 'text-slate-800' : 'text-slate-400'}`}
                  >
                    <option value="" disabled>{t('accounts.selectBank')}</option>
                    {Object.entries(banks).map(([key, info]) => (
                      <option key={key} value={key} className="text-slate-800">{info.name}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[160px]">
                  <label className="block text-sm font-medium text-slate-600 mb-1">{t('accounts.accountType')}</label>
                  <select
                    value={newAccountType}
                    onChange={(e) => setNewAccountType(e.target.value)}
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-500 ${newAccountType ? 'text-slate-800' : 'text-slate-400'}`}
                  >
                    <option value="" disabled>{t('accounts.selectType')}</option>
                    {Object.entries(accountTypes).map(([key, info]) => (
                      <option key={key} value={key} className="text-slate-800">{info.name}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[140px]">
                  <label className="block text-sm font-medium text-slate-600 mb-1">
                    {language === 'fr' ? 'Nom' : 'Name'} <span className="text-slate-400 font-normal">(TAB {language === 'fr' ? 'pour pré-remplir' : 'to pre-fill'})</span>
                  </label>
                  <input
                    type="text"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab' && !newAccountName.trim()) {
                        e.preventDefault();
                        setNewAccountName(getNextAccountNumber());
                      }
                    }}
                    placeholder={getNextAccountNumber()}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <button
                  onClick={handleCreateAccount}
                  disabled={!newAccountType || !newAccountBank || isCreating || waitingForNewAccount}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {(isCreating || waitingForNewAccount) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {(isCreating || waitingForNewAccount)
                    ? (language === 'fr' ? 'Création...' : 'Creating...')
                    : t('accounts.create')}
                </button>
                <button
                  onClick={() => { setShowAddAccountForm(false); setWaitingForNewAccount(false); setNewAccountName(''); setNewAccountType(''); setNewAccountBank(''); }}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  {t('accounts.cancel')}
                </button>
              </div>
              {/* Fee explanation when both type and bank are selected */}
              {newAccountType && newAccountBank && banks[newAccountBank] && (
                <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                  <p className="font-medium text-slate-700 mb-1">
                    {language === 'fr' ? 'Frais applicables:' : 'Applicable fees:'}
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>
                      {language === 'fr' ? 'Transaction' : 'Transaction'}: {banks[newAccountBank].order_fee_pct}% (min {banks[newAccountBank].order_fee_min}€)
                    </li>
                    <li>
                      {language === 'fr' ? 'Droits de garde' : 'Custody fees'}: {newAccountType === 'PEA' ? banks[newAccountBank].custody_fee_pct_year_pea : banks[newAccountBank].custody_fee_pct_year}%/{language === 'fr' ? 'an' : 'year'}
                    </li>
                    <li>
                      {language === 'fr' ? 'Change' : 'FX'}: {language === 'fr' ? banks[newAccountBank].fx_fee_info_fr : banks[newAccountBank].fx_fee_info_en}
                    </li>
                    <li>
                      {language === 'fr' ? 'Fiscalité' : 'Tax'}: {accountTypes[newAccountType]?.tax_rate}% {newAccountType === 'PEA' ? (language === 'fr' ? 'prél. sociaux' : 'social contrib.') : 'PFU'}
                    </li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Accounts List */}
          {accounts.length === 0 ? (
            <p className="text-slate-500 text-center py-4">{t('accounts.noAccounts')}</p>
          ) : (
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
              onDragOver={handleContainerDragOver}
              onDrop={handleContainerDrop}
            >
              {accounts.map((account, index) => {
                const isSelected = selectedAccountIds.includes(account.id);
                const isBeingDeleted = deletingAccountId === account.id;
                const isDragging = draggedAccountId === account.id;
                const isDragOver = dragOverAccountId === account.id;
                const transform = getTransform(account.id, index);
                const hasTransform = transform.x !== 0 || transform.y !== 0;

                return (
                  <div
                    key={account.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(account.id, el);
                      else cardRefs.current.delete(account.id);
                    }}
                    draggable={!isBeingDeleted}
                    onDragStart={(e) => handleDragStart(e, account.id, e.currentTarget)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, account.id)}
                    onDrop={(e) => handleDrop(e, account.id)}
                    onClick={() => !isBeingDeleted && !isDragging && onToggleAccount(account.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, accountId: account.id });
                    }}
                    style={{
                      transform: hasTransform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
                      transition: draggedAccountId ? 'transform 200ms ease-out' : undefined,
                      zIndex: isDragging ? 10 : undefined,
                    }}
                    className={`rounded-lg p-4 relative group ${
                      isBeingDeleted
                        ? 'cursor-not-allowed'
                        : 'cursor-pointer'
                    } ${
                      isDragOver
                        ? 'ring-2 ring-blue-500 ring-offset-2'
                        : ''
                    } ${
                      isSelected
                        ? 'bg-green-50 dark:bg-green-900/30 border-2 border-green-500 shadow-md'
                        : 'bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 hover:border-green-300 hover:shadow-sm'
                    }`}
                  >
                    {/* Deletion overlay */}
                    {isBeingDeleted && (
                      <div className="absolute inset-0 bg-white/80 dark:bg-slate-800/80 rounded-lg flex items-center justify-center z-10">
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="font-medium">
                            {language === 'fr' ? 'Suppression...' : 'Deleting...'}
                          </span>
                        </div>
                      </div>
                    )}
                      <div className="flex items-center gap-2 mb-2">
                      {/* Drag handle */}
                      <GripVertical
                        className="w-4 h-4 text-slate-400 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                      <Wallet className={`w-4 h-4 ${isSelected ? 'text-green-600' : 'text-slate-400'}`} />
                      {renamingAccountId === account.id ? (
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                              handleRenameSubmit();
                            } else if (e.key === 'Escape') {
                              handleRenameCancel();
                            }
                          }}
                          onBlur={handleRenameSubmit}
                          onClick={(e) => e.stopPropagation()}
                          disabled={isRenaming}
                          className="font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-700 border border-green-500 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-32"
                        />
                      ) : (
                        <span className={`font-bold ${isSelected ? 'text-green-700 dark:text-green-400' : 'text-slate-800 dark:text-slate-200'}`}>{account.name}</span>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        {isSelected && (
                          <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                            {language === 'fr' ? 'Sélectionné' : 'Selected'}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAccountPendingDelete(account.id);
                          }}
                          disabled={isDeleting || accountPendingDelete === account.id}
                          className={`transition-colors p-1 -m-1 ${accountPendingDelete === account.id ? 'text-red-600' : 'text-red-400 hover:text-red-600'}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                      <p><span className="text-slate-400">{t('accounts.type')}:</span> {account.type_info.name}</p>
                      <p><span className="text-slate-400">{t('accounts.bank')}:</span> {account.bank_info.name}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Delete Confirmation Banner */}
          {accountPendingDelete !== null && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="p-4 bg-slate-100 dark:bg-slate-600 border border-slate-300 dark:border-slate-500 rounded-lg text-center md:col-start-1 lg:col-start-2">
                <p className="text-slate-700 dark:text-slate-200 mb-1">
                  {language === 'fr' ? 'Voulez-vous supprimer ce compte ?' : 'Do you want to delete this account?'}
                </p>
                <p className="text-slate-800 dark:text-slate-100 font-bold mb-3">
                  {accounts.find(a => a.id === accountPendingDelete)?.name}
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => {
                      setDeletingAccountId(accountPendingDelete);
                      onDeleteAccount(accountPendingDelete);
                      setAccountPendingDelete(null);
                    }}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : (language === 'fr' ? 'Oui' : 'Yes')}
                  </button>
                  <button
                    onClick={() => setAccountPendingDelete(null)}
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-500 hover:bg-slate-300 dark:hover:bg-slate-400 text-slate-700 dark:text-slate-200 text-sm rounded-lg transition-colors"
                  >
                    {language === 'fr' ? 'Non' : 'No'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Fees Section - show for first selected account when only one selected */}
          {selectedAccounts.length === 1 && (
            <FeesDisplay
              selectedAccount={selectedAccounts[0]}
              language={language}
            />
          )}
        </>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              const accountId = contextMenu.accountId;
              setContextMenu(null);
              // Use setTimeout to ensure context menu is closed before showing input
              setTimeout(() => startRenaming(accountId), 0);
            }}
            className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center gap-2"
          >
            <Pencil className="w-4 h-4" />
            {language === 'fr' ? 'Renommer' : 'Rename'}
          </button>
          <button
            onClick={() => {
              onDuplicateAccount(contextMenu.accountId);
              setContextMenu(null);
            }}
            disabled={isDuplicating}
            className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center gap-2 disabled:opacity-50"
          >
            {isDuplicating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {language === 'fr' ? 'Dupliquer' : 'Duplicate'}
          </button>
        </div>
      )}
    </div>
  );
}
