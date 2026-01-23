import { useState, useEffect } from 'react';
import { Plus, Minus, Trash2, Loader2, Building2, Wallet } from 'lucide-react';
import { useLanguage } from '../../../../contexts/LanguageContext';
import type { Account, BankInfo, AccountTypeInfo } from './types';
import { FeesDisplay } from './FeesDisplay';

interface AccountSelectorProps {
  accounts: Account[];
  selectedAccountIds: number[];
  onToggleAccount: (id: number) => void;
  banks: Record<string, BankInfo>;
  accountTypes: Record<string, AccountTypeInfo>;
  onCreateAccount: (data: { name: string; account_type: string; bank: string }) => void;
  onDeleteAccount: (id: number) => void;
  isCreating: boolean;
  isDeleting: boolean;
}

export function AccountSelector({
  accounts,
  selectedAccountIds,
  onToggleAccount,
  banks,
  accountTypes,
  onCreateAccount,
  onDeleteAccount,
  isCreating,
  isDeleting,
}: AccountSelectorProps) {
  const { language, t } = useLanguage();

  const [showAccounts, setShowAccounts] = useState(true);
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('');
  const [newAccountBank, setNewAccountBank] = useState('');
  const [accountPendingDelete, setAccountPendingDelete] = useState<number | null>(null);

  // Clear pending delete when clicking outside
  useEffect(() => {
    if (accountPendingDelete !== null) {
      const timer = setTimeout(() => setAccountPendingDelete(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [accountPendingDelete]);

  const handleCreateAccount = () => {
    if (newAccountType && newAccountBank) {
      const defaultName = language === 'fr' ? `COMPTE ${accounts.length + 1}` : `ACCOUNT ${accounts.length + 1}`;
      const accountName = newAccountName.trim() || defaultName;
      onCreateAccount({
        name: accountName,
        account_type: newAccountType,
        bank: newAccountBank,
      });
      setNewAccountName('');
      setNewAccountType('');
      setNewAccountBank('');
      setShowAddAccountForm(false);
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
                        setNewAccountName(language === 'fr' ? `COMPTE ${accounts.length + 1}` : `ACCOUNT ${accounts.length + 1}`);
                      }
                    }}
                    placeholder={language === 'fr' ? `COMPTE ${accounts.length + 1}` : `ACCOUNT ${accounts.length + 1}`}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <button
                  onClick={handleCreateAccount}
                  disabled={!newAccountType || !newAccountBank || isCreating}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {t('accounts.create')}
                </button>
                <button
                  onClick={() => { setShowAddAccountForm(false); setNewAccountName(''); setNewAccountType(''); setNewAccountBank(''); }}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {accounts.map((account) => {
                const isSelected = selectedAccountIds.includes(account.id);
                return (
                  <div
                    key={account.id}
                    onClick={() => onToggleAccount(account.id)}
                    className={`rounded-lg p-4 relative group cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-green-50 dark:bg-green-900/30 border-2 border-green-500 shadow-md'
                        : 'bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 hover:border-green-300 hover:shadow-sm'
                    }`}
                  >
                      <div className="flex items-center gap-2 mb-2">
                      <Wallet className={`w-4 h-4 ${isSelected ? 'text-green-600' : 'text-slate-400'}`} />
                      <span className={`font-bold ${isSelected ? 'text-green-700 dark:text-green-400' : 'text-slate-800 dark:text-slate-200'}`}>{account.name}</span>
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
    </div>
  );
}
