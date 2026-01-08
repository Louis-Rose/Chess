import { useState } from 'react';
import { Plus, Minus, Wallet } from 'lucide-react';
import type { Account } from './types';

interface FeesDisplayProps {
  selectedAccount: Account;
  language: 'en' | 'fr';
}

export function FeesDisplay({ selectedAccount, language }: FeesDisplayProps) {
  const [showFees, setShowFees] = useState(true);

  const bankInfo = selectedAccount.bank_info;
  const typeInfo = selectedAccount.type_info;
  const isPEA = selectedAccount.account_type === 'PEA';
  const custodyFeeRate = isPEA ? bankInfo.custody_fee_pct_year_pea : bankInfo.custody_fee_pct_year;

  return (
    <div className="mt-6 pt-6 border-t border-slate-200">
      {/* Toggle button - centered */}
      <div className="flex justify-center mb-4">
        <button
          onClick={() => setShowFees(!showFees)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
        >
          {showFees ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showFees
            ? (language === 'fr' ? 'Masquer frais' : 'Hide fees')
            : (language === 'fr' ? 'Afficher frais' : 'Show fees')}
        </button>
      </div>

      {showFees && (
        <>
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="w-5 h-5 text-amber-600" />
            <h4 className="font-semibold text-amber-800">
              {language === 'fr' ? 'Frais et Impôts' : 'Fees & Taxes'} ({selectedAccount.bank_info.name} - {selectedAccount.account_type})
            </h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-amber-600 font-medium">
                {language === 'fr' ? 'Frais de transaction' : 'Transaction fees'}
              </p>
              <p className="text-amber-800">
                {bankInfo.order_fee_pct}%
                <span className="text-amber-600 text-xs ml-1">(min {bankInfo.order_fee_min}€)</span>
              </p>
            </div>
            <div>
              <p className="text-amber-600 font-medium">
                {language === 'fr' ? 'Droits de garde (annuels)' : 'Custody fees (yearly)'}
              </p>
              <p className="text-amber-800">
                {custodyFeeRate}%{isPEA ? ` (${language === 'fr' ? 'plafonné' : 'capped'})` : ''}
              </p>
            </div>
            <div>
              <p className="text-amber-600 font-medium">
                {language === 'fr' ? 'Frais de change' : 'FX fees'}
              </p>
              <p className="text-amber-800 text-xs">
                {language === 'fr' ? bankInfo.fx_fee_info_fr : bankInfo.fx_fee_info_en}
              </p>
            </div>
            <div>
              <p className="text-amber-600 font-medium">
                {language === 'fr' ? 'Fiscalité' : 'Taxation'}
              </p>
              <p className="text-amber-800">
                {typeInfo?.tax_rate}% {language === 'fr' ? 'sur plus-values' : 'on gains'}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
