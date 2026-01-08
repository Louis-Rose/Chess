# Investing utilities for portfolio calculations
import yfinance as yf
import numpy as np
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

# Global database connection (set by app.py)
_db_getter = None

# Cache TTL for current prices (15 minutes)
CURRENT_PRICE_TTL_MINUTES = 15

# European stock ticker to yfinance ticker mapping (exchange suffixes)
# Swiss stocks need .SW, German .DE, French .PA, UK .L, Italian .MI, etc.
EUROPEAN_TICKER_MAP = {
    # Swiss stocks (.SW) - Full SPI Index
    # Large caps
    'UHR': 'UHR.SW', 'NESN': 'NESN.SW', 'NOVN': 'NOVN.SW', 'ROG': 'ROG.SW',
    'ABBN': 'ABBN.SW', 'ZURN': 'ZURN.SW', 'SREN': 'SREN.SW', 'UBSG': 'UBSG.SW',
    'CSGN': 'CSGN.SW', 'GIVN': 'GIVN.SW', 'LONN': 'LONN.SW', 'SIKA': 'SIKA.SW',
    'GEBN': 'GEBN.SW', 'SCMN': 'SCMN.SW', 'SLHN': 'SLHN.SW', 'BALN': 'BALN.SW',
    'CFR': 'CFR.SW', 'ALC': 'ALC.SW', 'SOON': 'SOON.SW', 'PGHN': 'PGHN.SW',
    'BARN': 'BARN.SW', 'SGSN': 'SGSN.SW', 'TEMN': 'TEMN.SW', 'HOLN': 'HOLN.SW',
    'LOGN': 'LOGN.SW', 'VACN': 'VACN.SW', 'STMN': 'STMN.SW', 'BEKN': 'BEKN.SW',
    'LAND': 'LAND.SW', 'LHN': 'LHN.SW', 'SPSN': 'SPSN.SW', 'SIGN': 'SIGN.SW',
    # Mid caps
    'SCHP': 'SCHP.SW', 'KNIN': 'KNIN.SW', 'LNDN': 'LNDN.SW', 'EMSH': 'EMSH.SW',
    'BAER': 'BAER.SW', 'CLN': 'CLN.SW', 'GALD': 'GALD.SW', 'SDOZ': 'SDOZ.SW',
    'ADEN': 'ADEN.SW',
    # Banks & Financials
    'SQN': 'SQN.SW', 'EFGN': 'EFGN.SW', 'VONN': 'VONN.SW', 'CMBN': 'CMBN.SW',
    'VALN': 'VALN.SW', 'VZH': 'VZH.SW', 'BCVN': 'BCVN.SW', 'SGKN': 'SGKN.SW',
    'BKBN': 'BKBN.SW', 'THKB': 'THKB.SW', 'ZUGK': 'ZUGK.SW', 'GKB': 'GKB.SW',
    'LLBN': 'LLBN.SW', 'LUKN': 'LUKN.SW', 'BCGE': 'BCGE.SW',
    # Real estate
    'SPRE': 'SPRE.SW', 'PSPN': 'PSPN.SW', 'MOBN': 'MOBN.SW', 'ALLH': 'ALLH.SW',
    'HIAG': 'HIAG.SW', 'WARN': 'WARN.SW', 'PEHN': 'PEHN.SW',
    # Healthcare & Pharma
    'MEDN': 'MEDN.SW', 'YPSN': 'YPSN.SW', 'GALN': 'GALN.SW', 'BACH': 'BACH.SW',
    'DOTT': 'DOTT.SW', 'SIE': 'SIE.SW', 'BION': 'BION.SW',
    # Industrials
    'BUCN': 'BUCN.SW', 'GF': 'GF.SW', 'SUN': 'SUN.SW', 'BEAN': 'BEAN.SW',
    'SFSG': 'SFSG.SW', 'HUBN': 'HUBN.SW', 'DMKN': 'DMKN.SW', 'DAWG': 'DAWG.SW',
    'IFCN': 'IFCN.SW', 'ACLN': 'ACLN.SW', 'SIGG': 'SIGG.SW', 'BOBNN': 'BOBNN.SW',
    'KOMAX': 'KOMAX.SW', 'ARYN': 'ARYN.SW', 'INRN': 'INRN.SW', 'GURN': 'GURN.SW',
    'LISP': 'LISP.SW', 'COTN': 'COTN.SW', 'KARN': 'KARN.SW', 'ZEHN': 'ZEHN.SW',
    'VETN': 'VETN.SW', 'FORN': 'FORN.SW', 'MBTN': 'MBTN.SW',
    # Consumer & Services
    'DKSH': 'DKSH.SW', 'AVOL': 'AVOL.SW', 'EMMI': 'EMMI.SW', 'BELL': 'BELL.SW',
    'ORNA': 'ORNA.SW', 'HBLN': 'HBLN.SW', 'VBSN': 'VBSN.SW',
    # Technology
    'ALSN': 'ALSN.SW', 'SOFTG': 'SOFTG.SW', 'UHRN': 'UHRN.SW', 'SENS': 'SENS.SW',
    # Energy & Transport
    'BKW': 'BKW.SW', 'ROMN': 'ROMN.SW', 'FHZN': 'FHZN.SW',
    # Other
    'HELN': 'HELN.SW', 'APGN': 'APGN.SW', 'VAHN': 'VAHN.SW',
    # German stocks (.DE) - Note: many German stocks use .DE on Yahoo
    'ALV': 'ALV.DE', 'BAS': 'BAS.DE', 'BAYN': 'BAYN.DE', 'BMW': 'BMW.DE',
    'CON': 'CON.DE', 'DAI': 'DAI.DE', 'DB1': 'DB1.DE', 'DBK': 'DBK.DE',
    'DPW': 'DPW.DE', 'DTE': 'DTE.DE', 'EOAN': 'EOAN.DE', 'FME': 'FME.DE',
    'FRE': 'FRE.DE', 'HEI': 'HEI.DE', 'HEN3': 'HEN3.DE', 'IFX': 'IFX.DE',
    'LIN': 'LIN.DE', 'MRK': 'MRK.DE', 'MTX': 'MTX.DE', 'MUV2': 'MUV2.DE',
    'RWE': 'RWE.DE', 'SAP': 'SAP.DE', 'SIE': 'SIE.DE', 'VOW3': 'VOW3.DE',
    'VNA': 'VNA.DE', 'ADS': 'ADS.DE', 'AIR': 'AIR.PA', 'SY1': 'SY1.DE',
    'PAH3': 'PAH3.DE', 'BEI': 'BEI.DE', 'SHL': 'SHL.DE', 'ENR': 'ENR.DE',
    'HNR1': 'HNR1.DE', 'PUM': 'PUM.DE', 'ZAL': 'ZAL.DE', 'LEG': 'LEG.DE',
    'HFG': 'HFG.DE', 'TKA': 'TKA.DE', 'BOSS': 'BOSS.DE', '1COV': '1COV.DE',
    'EVK': 'EVK.DE', 'KCO': 'KCO.DE', 'DHL': 'DHL.DE', 'G24': 'G24.DE',
    # French stocks (.PA)
    'OR': 'OR.PA', 'MC': 'MC.PA', 'SAN': 'SAN.PA', 'AI': 'AI.PA',
    'BNP': 'BNP.PA', 'SU': 'SU.PA', 'CS': 'CS.PA', 'DG': 'DG.PA',
    'CAP': 'CAP.PA', 'VIE': 'VIE.PA', 'RI': 'RI.PA', 'KER': 'KER.PA',
    'CA': 'CA.PA', 'GLE': 'GLE.PA', 'EN': 'EN.PA', 'ENGI': 'ENGI.PA',
    'ORA': 'ORA.PA', 'VIV': 'VIV.PA', 'HO': 'HO.PA', 'SGO': 'SGO.PA',
    'PUB': 'PUB.PA', 'SW': 'SW.PA', 'ML': 'ML.PA', 'ATO': 'ATO.PA',
    'DSY': 'DSY.PA', 'STM': 'STM.PA', 'LR': 'LR.PA', 'ERF': 'ERF.PA',
    'RMS': 'RMS.PA', 'EL': 'EL.PA', 'BN': 'BN.PA', 'TEP': 'TEP.PA',
    'TTE': 'TTE.PA', 'SAF': 'SAF.PA', 'AM': 'AM.PA', 'AC': 'AC.PA',
    'ENX': 'ENX.PA', 'RBO': 'RBO.PA',
    # UK stocks (.L)
    'SHEL': 'SHEL.L', 'HSBA': 'HSBA.L', 'BP': 'BP.L', 'AZN': 'AZN.L',
    'GSK': 'GSK.L', 'RIO': 'RIO.L', 'ULVR': 'ULVR.L', 'DGE': 'DGE.L',
    'BATS': 'BATS.L', 'LLOY': 'LLOY.L', 'BARC': 'BARC.L', 'VOD': 'VOD.L',
    'NWG': 'NWG.L', 'NG': 'NG.L', 'SSE': 'SSE.L', 'REL': 'REL.L',
    'LSEG': 'LSEG.L', 'CRH': 'CRH.L', 'RKT': 'RKT.L', 'PRU': 'PRU.L',
    'EXPN': 'EXPN.L', 'AAL': 'AAL.L', 'IMB': 'IMB.L', 'AHT': 'AHT.L',
    'III': 'III.L', 'ANTO': 'ANTO.L', 'ABF': 'ABF.L', 'BA': 'BA.L',
    'CPG': 'CPG.L', 'WPP': 'WPP.L', 'LAND': 'LAND.L', 'GLEN': 'GLEN.L',
    'WTB': 'WTB.L', 'SGRO': 'SGRO.L', 'PSN': 'PSN.L', 'INF': 'INF.L',
    'RTO': 'RTO.L', 'JET': 'JET.L', 'IHG': 'IHG.L', 'STJ': 'STJ.L',
    # Italian stocks (.MI)
    'ENEL': 'ENEL.MI', 'ENI': 'ENI.MI', 'ISP': 'ISP.MI', 'UCG': 'UCG.MI',
    'RACE': 'RACE.MI', 'G': 'G.MI', 'STLA': 'STLA.MI', 'TEN': 'TEN.MI',
    'PRY': 'PRY.MI', 'SRG': 'SRG.MI', 'SPM': 'SPM.MI', 'LDO': 'LDO.MI',
    'MONC': 'MONC.MI', 'AMP': 'AMP.MI', 'BAMI': 'BAMI.MI', 'MB': 'MB.MI',
    # Dutch stocks (.AS)
    'ASML': 'ASML.AS', 'PHIA': 'PHIA.AS', 'INGA': 'INGA.AS', 'AD': 'AD.AS',
    'HEIA': 'HEIA.AS', 'DSM': 'DSM.AS', 'RAND': 'RAND.AS', 'NN': 'NN.AS',
    'KPN': 'KPN.AS', 'ABN': 'ABN.AS', 'AKZA': 'AKZA.AS', 'UNA': 'UNA.AS',
    'WKL': 'WKL.AS', 'RDSA': 'RDSA.AS', 'AGN': 'AGN.AS', 'MT': 'MT.AS',
    # Spanish stocks (.MC)
    'SAN': 'SAN.MC', 'IBE': 'IBE.MC', 'ITX': 'ITX.MC', 'BBVA': 'BBVA.MC',
    'TEF': 'TEF.MC', 'REP': 'REP.MC', 'ENG': 'ENG.MC', 'GRF': 'GRF.MC',
    'ACS': 'ACS.MC', 'FER': 'FER.MC', 'AENA': 'AENA.MC', 'CABK': 'CABK.MC',
    # Belgian stocks (.BR)
    'ABI': 'ABI.BR', 'KBC': 'KBC.BR', 'UCB': 'UCB.BR', 'SOLB': 'SOLB.BR',
    'ACKB': 'ACKB.BR', 'GBLB': 'GBLB.BR', 'UMI': 'UMI.BR', 'PROX': 'PROX.BR',
    # Danish stocks (.CO)
    'NOVO-B': 'NOVO-B.CO', 'NOVOB': 'NOVO-B.CO', 'CARL-B': 'CARL-B.CO',
    'VWS': 'VWS.CO', 'DSV': 'DSV.CO', 'MAERSK-B': 'MAERSK-B.CO', 'ORSTED': 'ORSTED.CO',
    'PNDORA': 'PNDORA.CO',
    # Finnish stocks (.HE)
    'NOKIA': 'NOKIA.HE', 'NESTE': 'NESTE.HE', 'FORTUM': 'FORTUM.HE',
    'UPM': 'UPM.HE', 'STERV': 'STERV.HE', 'KNEBV': 'KNEBV.HE',
    # Norwegian stocks (.OL)
    'EQNR': 'EQNR.OL', 'DNB': 'DNB.OL', 'TEL': 'TEL.OL', 'MOWI': 'MOWI.OL',
    'YAR': 'YAR.OL', 'NHY': 'NHY.OL', 'ORK': 'ORK.OL',
    # Swedish stocks (.ST)
    'ERIC-B': 'ERIC-B.ST', 'ERICB': 'ERIC-B.ST', 'VOLV-B': 'VOLV-B.ST',
    'HM-B': 'HM-B.ST', 'ATCO-A': 'ATCO-A.ST', 'SEB-A': 'SEB-A.ST',
    'SAND': 'SAND.ST', 'ABB': 'ABB.ST', 'INVE-B': 'INVE-B.ST',
    'EVO': 'EVO.ST', 'ALFA': 'ALFA.ST', 'SKA-B': 'SKA-B.ST',
    # Portuguese stocks (.LS)
    'EDP': 'EDP.LS', 'GALP': 'GALP.LS', 'JMT': 'JMT.LS',
    # Irish stocks (.IR)
    'RYA': 'RYA.IR', 'CRG': 'CRG.IR',
    # Austrian stocks (.VI)
    'VOE': 'VOE.VI', 'EBS': 'EBS.VI', 'OMV': 'OMV.VI',

    # ============================================
    # EUROPEAN SMALL & MID CAPS
    # ============================================

    # Swiss Small Caps (.SW)
    'APEN': 'APEN.SW', 'ARBN': 'ARBN.SW', 'BANB': 'BANB.SW', 'BOSN': 'BOSN.SW',
    'BURKN': 'BURKN.SW', 'CALN': 'CALN.SW', 'CICN': 'CICN.SW', 'CLTN': 'CLTN.SW',
    'CPGN': 'CPGN.SW', 'DESN': 'DESN.SW', 'DUFN': 'DUFN.SW', 'EDHN': 'EDHN.SW',
    'ELMN': 'ELMN.SW', 'FTON': 'FTON.SW', 'HBMN': 'HBMN.SW', 'IPS': 'IPS.SW',
    'KABN': 'KABN.SW', 'KNIG': 'KNIG.SW', 'LAND': 'LAND.SW', 'LEHN': 'LEHN.SW',
    'METN': 'METN.SW', 'MIKN': 'MIKN.SW', 'MOZN': 'MOZN.SW', 'NESN': 'NESN.SW',
    'NOVN': 'NOVN.SW', 'ORON': 'ORON.SW', 'PEDU': 'PEDU.SW', 'PGHN': 'PGHN.SW',
    'PLAN': 'PLAN.SW', 'PMSW': 'PMSW.SW', 'RAIN': 'RAIN.SW', 'REHN': 'REHN.SW',
    'ROSE': 'ROSE.SW', 'SANN': 'SANN.SW', 'SCHN': 'SCHN.SW', 'SFSN': 'SFSN.SW',
    'SKIN': 'SKIN.SW', 'SOHN': 'SOHN.SW', 'SWTQ': 'SWTQ.SW', 'TECN': 'TECN.SW',
    'TIBN': 'TIBN.SW', 'UHRN': 'UHRN.SW', 'VATN': 'VATN.SW', 'VLRT': 'VLRT.SW',
    'VONN': 'VONN.SW', 'WIHN': 'WIHN.SW', 'YPSN': 'YPSN.SW', 'ZUBN': 'ZUBN.SW',

    # German Small Caps - SDAX (.DE)
    'AAD': 'AAD.DE', 'ADJ': 'ADJ.DE', 'ADV': 'ADV.DE', 'AFX': 'AFX.DE',
    'AG1': 'AG1.DE', 'AIXA': 'AIXA.DE', 'AM3D': 'AM3D.DE', 'AOF': 'AOF.DE',
    'AT1': 'AT1.DE', 'B4B': 'B4B.DE', 'BC8': 'BC8.DE', 'BDT': 'BDT.DE',
    'BIO3': 'BIO3.DE', 'BNR': 'BNR.DE', 'BSL': 'BSL.DE', 'BYW6': 'BYW6.DE',
    'CEV': 'CEV.DE', 'COP': 'COP.DE', 'CWC': 'CWC.DE', 'DEQ': 'DEQ.DE',
    'DEZ': 'DEZ.DE', 'DIC': 'DIC.DE', 'DRW3': 'DRW3.DE', 'DUE': 'DUE.DE',
    'DWNI': 'DWNI.DE', 'ECK': 'ECK.DE', 'ECV': 'ECV.DE', 'ELAA': 'ELAA.DE',
    'EVT': 'EVT.DE', 'FIE': 'FIE.DE', 'FPE3': 'FPE3.DE', 'FRA': 'FRA.DE',
    'GBF': 'GBF.DE', 'GFT': 'GFT.DE', 'GIL': 'GIL.DE', 'GLJ': 'GLJ.DE',
    'GMM': 'GMM.DE', 'GXI': 'GXI.DE', 'GYC': 'GYC.DE', 'HAB': 'HAB.DE',
    'HAG': 'HAG.DE', 'HDD': 'HDD.DE', 'HLE': 'HLE.DE', 'HNL': 'HNL.DE',
    'HOT': 'HOT.DE', 'INH': 'INH.DE', 'JEN': 'JEN.DE', 'JUN3': 'JUN3.DE',
    'KGX': 'KGX.DE', 'KRN': 'KRN.DE', 'KSB3': 'KSB3.DE', 'KWS': 'KWS.DE',
    'LPK': 'LPK.DE', 'LXS': 'LXS.DE', 'MBB': 'MBB.DE', 'MDG1': 'MDG1.DE',
    'MLP': 'MLP.DE', 'MOR': 'MOR.DE', 'MUX': 'MUX.DE', 'NDX1': 'NDX1.DE',
    'NEM': 'NEM.DE', 'NWO': 'NWO.DE', 'O2D': 'O2D.DE', 'OSR': 'OSR.DE',
    'PBB': 'PBB.DE', 'PFV': 'PFV.DE', 'PNE3': 'PNE3.DE', 'PSM': 'PSM.DE',
    'RAA': 'RAA.DE', 'RHK': 'RHK.DE', 'RHM': 'RHM.DE', 'S92': 'S92.DE',
    'SAX': 'SAX.DE', 'SBS': 'SBS.DE', 'SFQ': 'SFQ.DE', 'SHA': 'SHA.DE',
    'SIX2': 'SIX2.DE', 'SKB': 'SKB.DE', 'SLT': 'SLT.DE', 'SMHN': 'SMHN.DE',
    'SNG': 'SNG.DE', 'SOW': 'SOW.DE', 'SRT3': 'SRT3.DE', 'SY1': 'SY1.DE',
    'SZG': 'SZG.DE', 'SZU': 'SZU.DE', 'TEG': 'TEG.DE', 'TPE': 'TPE.DE',
    'TTK': 'TTK.DE', 'UN01': 'UN01.DE', 'USE': 'USE.DE', 'VAR1': 'VAR1.DE',
    'VBK': 'VBK.DE', 'VIB3': 'VIB3.DE', 'VOS': 'VOS.DE', 'WAC': 'WAC.DE',
    'WAF': 'WAF.DE', 'WCH': 'WCH.DE', 'WIN': 'WIN.DE', 'WUW': 'WUW.DE',

    # French Small & Mid Caps (.PA)
    'ABCA': 'ABCA.PA', 'ABIO': 'ABIO.PA', 'ACTIA': 'ACTIA.PA', 'ALBI': 'ALBI.PA',
    'ALBLD': 'ALBLD.PA', 'ALDEL': 'ALDEL.PA', 'ALEMS': 'ALEMS.PA', 'ALHYG': 'ALHYG.PA',
    'ALKAL': 'ALKAL.PA', 'ALLIX': 'ALLIX.PA', 'ALMII': 'ALMII.PA', 'ALNEV': 'ALNEV.PA',
    'ALSEI': 'ALSEI.PA', 'ALSIP': 'ALSIP.PA', 'ALTEV': 'ALTEV.PA', 'ALTHE': 'ALTHE.PA',
    'ALTRO': 'ALTRO.PA', 'ALTUR': 'ALTUR.PA', 'ALVDM': 'ALVDM.PA', 'AREIT': 'AREIT.PA',
    'ARG': 'ARG.PA', 'ATE': 'ATE.PA', 'ATO': 'ATO.PA', 'AURE': 'AURE.PA',
    'BIG': 'BIG.PA', 'BIM': 'BIM.PA', 'BLC': 'BLC.PA', 'BLEE': 'BLEE.PA',
    'BOI': 'BOI.PA', 'BOL': 'BOL.PA', 'BUI': 'BUI.PA', 'BVD': 'BVD.PA',
    'CAT31': 'CAT31.PA', 'CBE': 'CBE.PA', 'CBR': 'CBR.PA', 'CDA': 'CDA.PA',
    'CGG': 'CGG.PA', 'CINE': 'CINE.PA', 'CNP': 'CNP.PA', 'COH': 'COH.PA',
    'COFA': 'COFA.PA', 'COV': 'COV.PA', 'CRI': 'CRI.PA', 'DBV': 'DBV.PA',
    'DEC': 'DEC.PA', 'DIM': 'DIM.PA', 'DLTA': 'DLTA.PA', 'ELIOR': 'ELIOR.PA',
    'EMG': 'EMG.PA', 'ERA': 'ERA.PA', 'ERF': 'ERF.PA', 'ESI': 'ESI.PA',
    'ETL': 'ETL.PA', 'EXE': 'EXE.PA', 'FDR': 'FDR.PA', 'FGR': 'FGR.PA',
    'FLY': 'FLY.PA', 'FNAC': 'FNAC.PA', 'GBT': 'GBT.PA', 'GDS': 'GDS.PA',
    'GEA': 'GEA.PA', 'GEN': 'GEN.PA', 'GET': 'GET.PA', 'GFC': 'GFC.PA',
    'GFI': 'GFI.PA', 'GNE': 'GNE.PA', 'GTT': 'GTT.PA', 'HAV': 'HAV.PA',
    'HDP': 'HDP.PA', 'HIM': 'HIM.PA', 'HMY': 'HMY.PA', 'ICAD': 'ICAD.PA',
    'IDL': 'IDL.PA', 'ILD': 'ILD.PA', 'ILV': 'ILV.PA', 'ING': 'ING.PA',
    'INN': 'INN.PA', 'IPS': 'IPS.PA', 'IVA': 'IVA.PA', 'KOF': 'KOF.PA',
    'KON': 'KON.PA', 'LAC': 'LAC.PA', 'LEM': 'LEM.PA', 'LI': 'LI.PA',
    'LNA': 'LNA.PA', 'LPE': 'LPE.PA', 'MAF': 'MAF.PA', 'MAN': 'MAN.PA',
    'MED': 'MED.PA', 'MMT': 'MMT.PA', 'MND': 'MND.PA', 'MRN': 'MRN.PA',
    'MRM': 'MRM.PA', 'MRV': 'MRV.PA', 'MTU': 'MTU.PA', 'NAT': 'NAT.PA',
    'NEO': 'NEO.PA', 'NRG': 'NRG.PA', 'NRO': 'NRO.PA', 'OLG': 'OLG.PA',
    'OPN': 'OPN.PA', 'ORA': 'ORA.PA', 'PAR': 'PAR.PA', 'PIG': 'PIG.PA',
    'POM': 'POM.PA', 'PSAT': 'PSAT.PA', 'QUA': 'QUA.PA', 'RCF': 'RCF.PA',
    'RCO': 'RCO.PA', 'RENE': 'RENE.PA', 'RF': 'RF.PA', 'RIN': 'RIN.PA',
    'RXL': 'RXL.PA', 'SAB': 'SAB.PA', 'SAMS': 'SAMS.PA', 'SBT': 'SBT.PA',
    'SCR': 'SCR.PA', 'SDG': 'SDG.PA', 'SEB': 'SEB.PA', 'SEV': 'SEV.PA',
    'SII': 'SII.PA', 'SLB': 'SLB.PA', 'SOI': 'SOI.PA', 'SOP': 'SOP.PA',
    'SPB': 'SPB.PA', 'SRP': 'SRP.PA', 'STEF': 'STEF.PA', 'TFF': 'TFF.PA',
    'TIPI': 'TIPI.PA', 'TNG': 'TNG.PA', 'TRI': 'TRI.PA', 'UBI': 'UBI.PA',
    'VAC': 'VAC.PA', 'VCT': 'VCT.PA', 'VET': 'VET.PA', 'VIL': 'VIL.PA',
    'VLA': 'VLA.PA', 'VMX': 'VMX.PA', 'VRN': 'VRN.PA', 'WLN': 'WLN.PA',

    # Italian Small & Mid Caps (.MI)
    'ALA': 'ALA.MI', 'ANT': 'ANT.MI', 'ASC': 'ASC.MI', 'ASR': 'ASR.MI',
    'AZM': 'AZM.MI', 'BAN': 'BAN.MI', 'BC': 'BC.MI', 'BCE': 'BCE.MI',
    'BGN': 'BGN.MI', 'BIA': 'BIA.MI', 'BIE': 'BIE.MI', 'BIT': 'BIT.MI',
    'BMED': 'BMED.MI', 'BPE': 'BPE.MI', 'BRE': 'BRE.MI', 'BRI': 'BRI.MI',
    'BRM': 'BRM.MI', 'BZU': 'BZU.MI', 'CAI': 'CAI.MI', 'CE': 'CE.MI',
    'CEM': 'CEM.MI', 'CLF': 'CLF.MI', 'CNHI': 'CNHI.MI', 'CPR': 'CPR.MI',
    'CRG': 'CRG.MI', 'DAL': 'DAL.MI', 'DAN': 'DAN.MI', 'DIA': 'DIA.MI',
    'DLG': 'DLG.MI', 'ELN': 'ELN.MI', 'ELC': 'ELC.MI', 'ERG': 'ERG.MI',
    'ERGY': 'ERGY.MI', 'FBK': 'FBK.MI', 'FCT': 'FCT.MI', 'FNM': 'FNM.MI',
    'FSI': 'FSI.MI', 'GAB': 'GAB.MI', 'GEO': 'GEO.MI', 'GEP': 'GEP.MI',
    'GIM': 'GIM.MI', 'GPI': 'GPI.MI', 'GVS': 'GVS.MI', 'HER': 'HER.MI',
    'IG': 'IG.MI', 'IGD': 'IGD.MI', 'INW': 'INW.MI', 'IP': 'IP.MI',
    'IRC': 'IRC.MI', 'IVG': 'IVG.MI', 'IVS': 'IVS.MI', 'KRE': 'KRE.MI',
    'LDL': 'LDL.MI', 'LIT': 'LIT.MI', 'MFE': 'MFE.MI', 'MNL': 'MNL.MI',
    'MON': 'MON.MI', 'MTF': 'MTF.MI', 'NDC': 'NDC.MI', 'NWL': 'NWL.MI',
    'OLI': 'OLI.MI', 'ORS': 'ORS.MI', 'OVS': 'OVS.MI', 'PHN': 'PHN.MI',
    'PIA': 'PIA.MI', 'PLC': 'PLC.MI', 'PLT': 'PLT.MI', 'PRM': 'PRM.MI',
    'RAI': 'RAI.MI', 'RCS': 'RCS.MI', 'REC': 'REC.MI', 'REP': 'REP.MI',
    'SAL': 'SAL.MI', 'SES': 'SES.MI', 'SFL': 'SFL.MI', 'SOL': 'SOL.MI',
    'SRS': 'SRS.MI', 'TES': 'TES.MI', 'TFI': 'TFI.MI', 'TIP': 'TIP.MI',
    'TIT': 'TIT.MI', 'TOD': 'TOD.MI', 'TRN': 'TRN.MI', 'TYA': 'TYA.MI',
    'UCM': 'UCM.MI', 'UNI': 'UNI.MI', 'US': 'US.MI', 'VAS': 'VAS.MI',

    # Spanish Small & Mid Caps (.MC)
    'A3M': 'A3M.MC', 'ACX': 'ACX.MC', 'ADZ': 'ADZ.MC', 'ALM': 'ALM.MC',
    'AMP': 'AMP.MC', 'ANA': 'ANA.MC', 'AMS': 'AMS.MC', 'APAM': 'APAM.MC',
    'APPS': 'APPS.MC', 'BKT': 'BKT.MC', 'CAF': 'CAF.MC', 'CASH': 'CASH.MC',
    'CIE': 'CIE.MC', 'CLNX': 'CLNX.MC', 'COL': 'COL.MC', 'DOM': 'DOM.MC',
    'EBRO': 'EBRO.MC', 'ECR': 'ECR.MC', 'EKT': 'EKT.MC', 'ELE': 'ELE.MC',
    'ENC': 'ENC.MC', 'FCC': 'FCC.MC', 'FDR': 'FDR.MC', 'GCO': 'GCO.MC',
    'HOME': 'HOME.MC', 'IAG': 'IAG.MC', 'IDR': 'IDR.MC', 'INA': 'INA.MC',
    'INM': 'INM.MC', 'LGT': 'LGT.MC', 'LIB': 'LIB.MC', 'LOG': 'LOG.MC',
    'MAP': 'MAP.MC', 'MAS': 'MAS.MC', 'MEL': 'MEL.MC', 'MRL': 'MRL.MC',
    'MTS': 'MTS.MC', 'NHH': 'NHH.MC', 'NTC': 'NTC.MC', 'OHL': 'OHL.MC',
    'PHM': 'PHM.MC', 'PRS': 'PRS.MC', 'PSG': 'PSG.MC', 'QBT': 'QBT.MC',
    'REE': 'REE.MC', 'REN': 'REN.MC', 'RLB': 'RLB.MC', 'SAB': 'SAB.MC',
    'SCYR': 'SCYR.MC', 'SLR': 'SLR.MC', 'TL5': 'TL5.MC', 'TRE': 'TRE.MC',
    'TUB': 'TUB.MC', 'UBS': 'UBS.MC', 'UNI': 'UNI.MC', 'VID': 'VID.MC',
    'VIS': 'VIS.MC', 'ZOT': 'ZOT.MC',

    # Dutch Small & Mid Caps (.AS)
    'AALB': 'AALB.AS', 'ACCEL': 'ACCEL.AS', 'AJAX': 'AJAX.AS', 'ALFEN': 'ALFEN.AS',
    'ARCAD': 'ARCAD.AS', 'ASRNL': 'ASRNL.AS', 'BAMNB': 'BAMNB.AS', 'BASIC': 'BASIC.AS',
    'BESI': 'BESI.AS', 'BFIT': 'BFIT.AS', 'BOLS': 'BOLS.AS', 'BRNL': 'BRNL.AS',
    'CMCOM': 'CMCOM.AS', 'CORD': 'CORD.AS', 'CRBN': 'CRBN.AS', 'CUR': 'CUR.AS',
    'ECMPA': 'ECMPA.AS', 'FFARM': 'FFARM.AS', 'FLOW': 'FLOW.AS', 'FUR': 'FUR.AS',
    'HEIJM': 'HEIJM.AS', 'HEIO': 'HEIO.AS', 'HYDRA': 'HYDRA.AS', 'IMCD': 'IMCD.AS',
    'INTER': 'INTER.AS', 'JDEP': 'JDEP.AS', 'JUST': 'JUST.AS', 'KENDR': 'KENDR.AS',
    'NEDAP': 'NEDAP.AS', 'NEDSN': 'NEDSN.AS', 'NSI': 'NSI.AS', 'ORDI': 'ORDI.AS',
    'OCI': 'OCI.AS', 'PNL': 'PNL.AS', 'POST': 'POST.AS', 'PRYME': 'PRYME.AS',
    'SBMO': 'SBMO.AS', 'SIFG': 'SIFG.AS', 'SLIG': 'SLIG.AS', 'SNT': 'SNT.AS',
    'TKWY': 'TKWY.AS', 'TOM2': 'TOM2.AS', 'TWEKA': 'TWEKA.AS', 'URW': 'URW.AS',
    'VAS': 'VAS.AS', 'VASTB': 'VASTB.AS', 'VEON': 'VEON.AS', 'VIVAP': 'VIVAP.AS',

    # Belgian Small & Mid Caps (.BR)
    'ACKB': 'ACKB.BR', 'AED': 'AED.BR', 'AGFB': 'AGFB.BR', 'AJOB': 'AJOB.BR',
    'ARG': 'ARG.BR', 'ARGX': 'ARGX.BR', 'ASCE': 'ASCE.BR', 'AZE': 'AZE.BR',
    'BAR': 'BAR.BR', 'BEFB': 'BEFB.BR', 'BELU': 'BELU.BR', 'BRCK': 'BRCK.BR',
    'BRG': 'BRG.BR', 'BRI': 'BRI.BR', 'BPOST': 'BPOST.BR', 'CAMB': 'CAMB.BR',
    'CASA': 'CASA.BR', 'CFE': 'CFE.BR', 'COFB': 'COFB.BR', 'COLR': 'COLR.BR',
    'CRBN': 'CRBN.BR', 'DECB': 'DECB.BR', 'DIE': 'DIE.BR', 'ECMB': 'ECMB.BR',
    'ELI': 'ELI.BR', 'ENGI': 'ENGI.BR', 'ERYP': 'ERYP.BR', 'EVS': 'EVS.BR',
    'FAGR': 'FAGR.BR', 'FIRE': 'FIRE.BR', 'FLOB': 'FLOB.BR', 'FLU': 'FLU.BR',
    'GBLB': 'GBLB.BR', 'GLPG': 'GLPG.BR', 'GOU': 'GOU.BR', 'GREEN': 'GREEN.BR',
    'HOMI': 'HOMI.BR', 'IMMO': 'IMMO.BR', 'INGA': 'INGA.BR', 'INT': 'INT.BR',
    'INTB': 'INTB.BR', 'ION': 'ION.BR', 'IVA': 'IVA.BR', 'KARD': 'KARD.BR',
    'LOTB': 'LOTB.BR', 'MDX': 'MDX.BR', 'MELE': 'MELE.BR', 'MIT': 'MIT.BR',
    'MOBB': 'MOBB.BR', 'MOBI': 'MOBI.BR', 'MONT': 'MONT.BR', 'MPP': 'MPP.BR',
    'NYR': 'NYR.BR', 'ONTX': 'ONTX.BR', 'OXUR': 'OXUR.BR', 'PROX': 'PROX.BR',
    'QFG': 'QFG.BR', 'REC': 'REC.BR', 'RES': 'RES.BR', 'RET': 'RET.BR',
    'ROSA': 'ROSA.BR', 'SCHD': 'SCHD.BR', 'SCHL': 'SCHL.BR', 'SEQU': 'SEQU.BR',
    'SFPI': 'SFPI.BR', 'SOMB': 'SOMB.BR', 'TEXF': 'TEXF.BR', 'THEB': 'THEB.BR',
    'TINC': 'TINC.BR', 'TNET': 'TNET.BR', 'UCB': 'UCB.BR', 'VANN': 'VANN.BR',
    'VAN': 'VAN.BR', 'VGP': 'VGP.BR', 'VIOL': 'VIOL.BR', 'WDP': 'WDP.BR',
    'WEB': 'WEB.BR', 'WRIT': 'WRIT.BR', 'XIOR': 'XIOR.BR', 'ZEN': 'ZEN.BR',

    # Danish Small & Mid Caps (.CO)
    'ASGN': 'ASGN.CO', 'ALK-B': 'ALK-B.CO', 'ALMB': 'ALMB.CO', 'AMBU-B': 'AMBU-B.CO',
    'AOJ-P': 'AOJ-P.CO', 'ASTRO': 'ASTRO.CO', 'ATLA-DK': 'ATLA-DK.CO', 'AQ': 'AQ.CO',
    'BAVA': 'BAVA.CO', 'BIF': 'BIF.CO', 'BNOR': 'BNOR.CO', 'BNORD': 'BNORD.CO',
    'CBRAIN': 'CBRAIN.CO', 'CHEMM': 'CHEMM.CO', 'CHR': 'CHR.CO', 'COLO-B': 'COLO-B.CO',
    'DAB': 'DAB.CO', 'DAN': 'DAN.CO', 'DANSKE': 'DANSKE.CO', 'DFDS': 'DFDS.CO',
    'DEMANT': 'DEMANT.CO', 'FLS': 'FLS.CO', 'FLUG': 'FLUG.CO', 'GMAB': 'GMAB.CO',
    'GN': 'GN.CO', 'GW': 'GW.CO', 'HARB-B': 'HARB-B.CO', 'HOLM-B': 'HOLM-B.CO',
    'ISS': 'ISS.CO', 'JYSK': 'JYSK.CO', 'LUXOR-B': 'LUXOR-B.CO', 'MATAS': 'MATAS.CO',
    'NDA-DK': 'NDA-DK.CO', 'NEWC': 'NEWC.CO', 'NKT': 'NKT.CO', 'NNIT': 'NNIT.CO',
    'NORDFO': 'NORDFO.CO', 'NREP': 'NREP.CO', 'NZYM-B': 'NZYM-B.CO', 'OBK': 'OBK.CO',
    'PARKE': 'PARKE.CO', 'PAAL-B': 'PAAL-B.CO', 'RBREW': 'RBREW.CO', 'RILBA': 'RILBA.CO',
    'ROCK-B': 'ROCK-B.CO', 'RTX': 'RTX.CO', 'SAS-DK': 'SAS-DK.CO', 'SCHOUW': 'SCHOUW.CO',
    'SDNS': 'SDNS.CO', 'SIM': 'SIM.CO', 'SKAKO': 'SKAKO.CO', 'SPNO': 'SPNO.CO',
    'SPSN': 'SPSN.CO', 'STER': 'STER.CO', 'STG': 'STG.CO', 'SYDB': 'SYDB.CO',
    'TCLB': 'TCLB.CO', 'TECO': 'TECO.CO', 'TIV': 'TIV.CO', 'TOP': 'TOP.CO',
    'TRYG': 'TRYG.CO', 'UIE': 'UIE.CO', 'VWS': 'VWS.CO', 'ZEAL': 'ZEAL.CO',

    # Swedish Small & Mid Caps (.ST)
    'AAK': 'AAK.ST', 'ADDV-B': 'ADDV-B.ST', 'AEC': 'AEC.ST', 'AFRY': 'AFRY.ST',
    'AHLER-B': 'AHLER-B.ST', 'ALIF-B': 'ALIF-B.ST', 'ANOT': 'ANOT.ST', 'ARCOMA': 'ARCOMA.ST',
    'ARION': 'ARION.ST', 'ARJO-B': 'ARJO-B.ST', 'ASSA-B': 'ASSA-B.ST', 'ATCO-A': 'ATCO-A.ST',
    'ATCO-B': 'ATCO-B.ST', 'ATRL-A': 'ATRL-A.ST', 'AXFO': 'AXFO.ST', 'AXIS': 'AXIS.ST',
    'BALD-B': 'BALD-B.ST', 'BALCO': 'BALCO.ST', 'BEGR': 'BEGR.ST', 'BERG-B': 'BERG-B.ST',
    'BETS-B': 'BETS-B.ST', 'BICO': 'BICO.ST', 'BILI-A': 'BILI-A.ST', 'BILL': 'BILL.ST',
    'BIOAR-B': 'BIOAR-B.ST', 'BIOTAGE': 'BIOTAGE.ST', 'BOL': 'BOL.ST', 'BONAV-B': 'BONAV-B.ST',
    'BOOZT': 'BOOZT.ST', 'BRAV': 'BRAV.ST', 'BRG-B': 'BRG-B.ST', 'BUFAB': 'BUFAB.ST',
    'BURE': 'BURE.ST', 'CAST': 'CAST.ST', 'CATE': 'CATE.ST', 'CINT': 'CINT.ST',
    'CLAS-B': 'CLAS-B.ST', 'COLL': 'COLL.ST', 'CTT': 'CTT.ST', 'DOM': 'DOM.ST',
    'DURC-B': 'DURC-B.ST', 'ELEC': 'ELEC.ST', 'EKTA-B': 'EKTA-B.ST', 'ELUX-B': 'ELUX-B.ST',
    'EMBRAC-B': 'EMBRAC-B.ST', 'ENEA': 'ENEA.ST', 'ESSITY-B': 'ESSITY-B.ST',
    'FABG': 'FABG.ST', 'FG': 'FG.ST', 'FNOX': 'FNOX.ST', 'GENO': 'GENO.ST',
    'GETI-B': 'GETI-B.ST', 'GREN': 'GREN.ST', 'GRNG': 'GRNG.ST', 'HANZA': 'HANZA.ST',
    'HEXA-B': 'HEXA-B.ST', 'HLDX': 'HLDX.ST', 'HMAY': 'HMAY.ST', 'HOLM-A': 'HOLM-A.ST',
    'HOLM-B': 'HOLM-B.ST', 'HPOL-B': 'HPOL-B.ST', 'HUSQ-A': 'HUSQ-A.ST', 'HUSQ-B': 'HUSQ-B.ST',
    'ICA': 'ICA.ST', 'IMMU': 'IMMU.ST', 'INDU-A': 'INDU-A.ST', 'INDU-C': 'INDU-C.ST',
    'INTRUM': 'INTRUM.ST', 'IPCO': 'IPCO.ST', 'JM': 'JM.ST', 'KABE-B': 'KABE-B.ST',
    'KAMBI': 'KAMBI.ST', 'KIND-SDB': 'KIND-SDB.ST', 'KINV-A': 'KINV-A.ST', 'KINV-B': 'KINV-B.ST',
    'KNOW': 'KNOW.ST', 'LAGR-B': 'LAGR-B.ST', 'LATF-B': 'LATF-B.ST', 'LIFCO-B': 'LIFCO-B.ST',
    'LIMT': 'LIMT.ST', 'LOOM-B': 'LOOM-B.ST', 'LUND-B': 'LUND-B.ST', 'LUNE': 'LUNE.ST',
    'LYKO': 'LYKO.ST', 'MAHA-A': 'MAHA-A.ST', 'MCOV-B': 'MCOV-B.ST', 'MEKO': 'MEKO.ST',
    'MIDS': 'MIDS.ST', 'MIL': 'MIL.ST', 'MIPS': 'MIPS.ST', 'MTRS': 'MTRS.ST',
    'NAXS': 'NAXS.ST', 'NBES': 'NBES.ST', 'NENT-B': 'NENT-B.ST', 'NET-B': 'NET-B.ST',
    'NEWA-B': 'NEWA-B.ST', 'NIBE-B': 'NIBE-B.ST', 'NCC-A': 'NCC-A.ST', 'NCC-B': 'NCC-B.ST',
    'NOBI': 'NOBI.ST', 'NOLA-B': 'NOLA-B.ST', 'NYF': 'NYF.ST', 'OP': 'OP.ST',
    'ORI': 'ORI.ST', 'OX2': 'OX2.ST', 'PACT': 'PACT.ST', 'PEAB-B': 'PEAB-B.ST',
    'PNDX-B': 'PNDX-B.ST', 'POOL-B': 'POOL-B.ST', 'PREV-B': 'PREV-B.ST', 'PRIC-B': 'PRIC-B.ST',
    'PROB': 'PROB.ST', 'QLINEA': 'QLINEA.ST', 'RAY-B': 'RAY-B.ST', 'READ': 'READ.ST',
    'RESURS': 'RESURS.ST', 'RVRC': 'RVRC.ST', 'SAAB-B': 'SAAB-B.ST', 'SAGA-A': 'SAGA-A.ST',
    'SAGA-B': 'SAGA-B.ST', 'SAVE': 'SAVE.ST', 'SCST': 'SCST.ST', 'SEB-A': 'SEB-A.ST',
    'SEB-C': 'SEB-C.ST', 'SECT-B': 'SECT-B.ST', 'SECU-B': 'SECU-B.ST', 'SHB-A': 'SHB-A.ST',
    'SHB-B': 'SHB-B.ST', 'SINCH': 'SINCH.ST', 'SKA-B': 'SKA-B.ST', 'SKF-A': 'SKF-A.ST',
    'SKF-B': 'SKF-B.ST', 'SOLT': 'SOLT.ST', 'SSAB-A': 'SSAB-A.ST', 'SSAB-B': 'SSAB-B.ST',
    'STOR-B': 'STOR-B.ST', 'STE-R': 'STE-R.ST', 'SVOL-A': 'SVOL-A.ST', 'SVOL-B': 'SVOL-B.ST',
    'SWEC-A': 'SWEC-A.ST', 'SWEC-B': 'SWEC-B.ST', 'SWED-A': 'SWED-A.ST', 'SWE': 'SWE.ST',
    'TEL2-B': 'TEL2-B.ST', 'THULE': 'THULE.ST', 'TIGO': 'TIGO.ST', 'TREL-B': 'TREL-B.ST',
    'TRIT': 'TRIT.ST', 'TTAB': 'TTAB.ST', 'VBG-B': 'VBG-B.ST', 'VICORE': 'VICORE.ST',
    'VITRO': 'VITRO.ST', 'VIT-B': 'VIT-B.ST', 'VNV': 'VNV.ST', 'VOLO': 'VOLO.ST',
    'WALL-B': 'WALL-B.ST', 'WINT': 'WINT.ST', 'WIHL': 'WIHL.ST', 'XVIVO': 'XVIVO.ST',

    # Norwegian Small & Mid Caps (.OL)
    'AASB': 'AASB.OL', 'AEGA': 'AEGA.OL', 'AKAST': 'AKAST.OL', 'AKERBP': 'AKERBP.OL',
    'AKSO': 'AKSO.OL', 'AMSC': 'AMSC.OL', 'ARCH': 'ARCH.OL', 'ATLN': 'ATLN.OL',
    'ATEA': 'ATEA.OL', 'AURG': 'AURG.OL', 'AUTO': 'AUTO.OL', 'AYGAZ': 'AYGAZ.OL',
    'BAKKA': 'BAKKA.OL', 'BELCO': 'BELCO.OL', 'BEWI': 'BEWI.OL', 'BNOR': 'BNOR.OL',
    'BONHR': 'BONHR.OL', 'BORR': 'BORR.OL', 'BWO': 'BWO.OL', 'CRAYN': 'CRAYN.OL',
    'DNO': 'DNO.OL', 'ELK': 'ELK.OL', 'ELMRA': 'ELMRA.OL', 'ENDUR': 'ENDUR.OL',
    'ENTRA': 'ENTRA.OL', 'EPR': 'EPR.OL', 'FJORD': 'FJORD.OL', 'FRO': 'FRO.OL',
    'FROY': 'FROY.OL', 'GJF': 'GJF.OL', 'GOGL': 'GOGL.OL', 'GSF': 'GSF.OL',
    'HAFNI': 'HAFNI.OL', 'HAUTO': 'HAUTO.OL', 'HEMP': 'HEMP.OL', 'HUNT': 'HUNT.OL',
    'IDP': 'IDP.OL', 'KID': 'KID.OL', 'KOA': 'KOA.OL', 'KOG': 'KOG.OL',
    'LSALM': 'LSALM.OL', 'LSGR': 'LSGR.OL', 'MHG': 'MHG.OL', 'MULTI': 'MULTI.OL',
    'NEL': 'NEL.OL', 'NEXT': 'NEXT.OL', 'NOFI': 'NOFI.OL', 'NORBT': 'NORBT.OL',
    'NOD': 'NOD.OL', 'NOM': 'NOM.OL', 'NRC': 'NRC.OL', 'NRS': 'NRS.OL',
    'ODF': 'ODF.OL', 'OKEA': 'OKEA.OL', 'OLT': 'OLT.OL', 'OTEC': 'OTEC.OL',
    'OTS': 'OTS.OL', 'PAR': 'PAR.OL', 'PARB': 'PARB.OL', 'PEN': 'PEN.OL',
    'PGS': 'PGS.OL', 'PHO': 'PHO.OL', 'PROT': 'PROT.OL', 'QEC': 'QEC.OL',
    'RECSI': 'RECSI.OL', 'REC': 'REC.OL', 'SAGA': 'SAGA.OL', 'SALMON': 'SALMON.OL',
    'SALME': 'SALME.OL', 'SASNO': 'SASNO.OL', 'SATS': 'SATS.OL', 'SBO': 'SBO.OL',
    'SCHB': 'SCHB.OL', 'SCATC': 'SCATC.OL', 'SDF': 'SDF.OL', 'SHLF': 'SHLF.OL',
    'SKUE': 'SKUE.OL', 'SNI': 'SNI.OL', 'SPOG': 'SPOG.OL', 'SRBNK': 'SRBNK.OL',
    'SSG': 'SSG.OL', 'STBO': 'STBO.OL', 'STB': 'STB.OL', 'SUBC': 'SUBC.OL',
    'TEL': 'TEL.OL', 'THIN': 'THIN.OL', 'TGS': 'TGS.OL', 'TOM': 'TOM.OL',
    'VAR': 'VAR.OL', 'VEI': 'VEI.OL', 'VOLUE': 'VOLUE.OL', 'VOW': 'VOW.OL',
    'WSTEP': 'WSTEP.OL', 'WWI': 'WWI.OL', 'YARA': 'YARA.OL', 'ZAL': 'ZAL.OL',

    # Finnish Small & Mid Caps (.HE)
    'AFAGR': 'AFAGR.HE', 'AKTIA': 'AKTIA.HE', 'ALMA': 'ALMA.HE', 'APETIT': 'APETIT.HE',
    'ASPO': 'ASPO.HE', 'ATRAV': 'ATRAV.HE', 'BALDS': 'BALDS.HE', 'BITTI': 'BITTI.HE',
    'BOREO': 'BOREO.HE', 'CAPMAN': 'CAPMAN.HE', 'CAR': 'CAR.HE', 'CAV1V': 'CAV1V.HE',
    'CGCBV': 'CGCBV.HE', 'CTY1S': 'CTY1S.HE', 'DIGIGR': 'DIGIGR.HE', 'DIGIA': 'DIGIA.HE',
    'DOV1V': 'DOV1V.HE', 'DUERIT': 'DUERIT.HE', 'EEZY': 'EEZY.HE', 'ELISA': 'ELISA.HE',
    'ENDOM': 'ENDOM.HE', 'ENENTO': 'ENENTO.HE', 'EVLI': 'EVLI.HE', 'EXL1V': 'EXL1V.HE',
    'FIA1S': 'FIA1S.HE', 'FSECURE': 'FSECURE.HE', 'GOFORE': 'GOFORE.HE', 'HARVIA': 'HARVIA.HE',
    'HKS1V': 'HKS1V.HE', 'HONBS': 'HONBS.HE', 'HUH1V': 'HUH1V.HE', 'ICP1V': 'ICP1V.HE',
    'INVEST': 'INVEST.HE', 'KAMUX': 'KAMUX.HE', 'KCR': 'KCR.HE', 'KESKOA': 'KESKOA.HE',
    'KESKOB': 'KESKOB.HE', 'KHG': 'KHG.HE', 'KOJAMO': 'KOJAMO.HE', 'KONECR': 'KONECR.HE',
    'KREATE': 'KREATE.HE', 'KSLAV': 'KSLAV.HE', 'LAT1V': 'LAT1V.HE', 'LEMON': 'LEMON.HE',
    'MARAS': 'MARAS.HE', 'METSO': 'METSO.HE', 'METSB': 'METSB.HE', 'MUSTI': 'MUSTI.HE',
    'NESTE': 'NESTE.HE', 'NOKIA': 'NOKIA.HE', 'NDA1V': 'NDA1V.HE', 'NOHO': 'NOHO.HE',
    'OLVAS': 'OLVAS.HE', 'OKDAV': 'OKDAV.HE', 'OPER': 'OPER.HE', 'ORNAV': 'ORNAV.HE',
    'ORTHEX': 'ORTHEX.HE', 'OTE1V': 'OTE1V.HE', 'PIHLIS': 'PIHLIS.HE', 'PIREL': 'PIREL.HE',
    'PKC1V': 'PKC1V.HE', 'PLMVS': 'PLMVS.HE', 'POHJA': 'POHJA.HE', 'PON1V': 'PON1V.HE',
    'POS1V': 'POS1V.HE', 'PUMU': 'PUMU.HE', 'PUUILO': 'PUUILO.HE', 'QT1V': 'QT1V.HE',
    'QTCOM': 'QTCOM.HE', 'RAISU': 'RAISU.HE', 'REKA': 'REKA.HE', 'REMEDY': 'REMEDY.HE',
    'REVA': 'REVA.HE', 'ROBIT': 'ROBIT.HE', 'SAGCV': 'SAGCV.HE', 'SAMPO': 'SAMPO.HE',
    'SANOMA': 'SANOMA.HE', 'SOSI1': 'SOSI1.HE', 'SCANFL': 'SCANFL.HE', 'SSH1V': 'SSH1V.HE',
    'SIEVI': 'SIEVI.HE', 'SOLTEQ': 'SOLTEQ.HE', 'SOPRA': 'SOPRA.HE', 'SRV1V': 'SRV1V.HE',
    'SSA1S': 'SSA1S.HE', 'STOCKA': 'STOCKA.HE', 'STOCKH': 'STOCKH.HE', 'SUPM': 'SUPM.HE',
    'TAL1V': 'TAL1V.HE', 'TELIA1': 'TELIA1.HE', 'TIETO': 'TIETO.HE', 'TKAAV': 'TKAAV.HE',
    'TOKMAN': 'TOKMAN.HE', 'TYRES': 'TYRES.HE', 'UPONOR': 'UPONOR.HE', 'UPM': 'UPM.HE',
    'VALMT': 'VALMT.HE', 'VERK': 'VERK.HE', 'VINCIT': 'VINCIT.HE', 'VIK1V': 'VIK1V.HE',
    'WRT1V': 'WRT1V.HE', 'YIT': 'YIT.HE', 'YOHO': 'YOHO.HE', 'YLENIS': 'YLENIS.HE',

    # Portuguese Small & Mid Caps (.LS)
    'BCP': 'BCP.LS', 'CFN': 'CFN.LS', 'COR': 'COR.LS', 'CTT': 'CTT.LS',
    'EGL': 'EGL.LS', 'ALTRI': 'ALTRI.LS', 'GPA': 'GPA.LS', 'IPR': 'IPR.LS',
    'MBA': 'MBA.LS', 'MOTA': 'MOTA.LS', 'NBA': 'NBA.LS', 'NOS': 'NOS.LS',
    'PHR': 'PHR.LS', 'RAM': 'RAM.LS', 'RED': 'RED.LS', 'RENE': 'RENE.LS',
    'SCP': 'SCP.LS', 'SEM': 'SEM.LS', 'SON': 'SON.LS', 'SLBEN': 'SLBEN.LS',
    'TDSA': 'TDSA.LS', 'VAF': 'VAF.LS',

    # Austrian Small & Mid Caps (.VI)
    'AGR': 'AGR.VI', 'AMS': 'AMS.VI', 'AND': 'AND.VI', 'ANDR': 'ANDR.VI',
    'ATS': 'ATS.VI', 'BAWAG': 'BAWAG.VI', 'BWT': 'BWT.VI', 'CAI': 'CAI.VI',
    'DOC': 'DOC.VI', 'EBS': 'EBS.VI', 'EVN': 'EVN.VI', 'FAA': 'FAA.VI',
    'FLU': 'FLU.VI', 'FTE': 'FTE.VI', 'IIA': 'IIA.VI', 'LNZ': 'LNZ.VI',
    'MARI': 'MARI.VI', 'MMK': 'MMK.VI', 'PAL': 'PAL.VI', 'POS': 'POS.VI',
    'POST': 'POST.VI', 'RBI': 'RBI.VI', 'RHIM': 'RHIM.VI', 'ROS': 'ROS.VI',
    'SBO': 'SBO.VI', 'SEM': 'SEM.VI', 'SNTN': 'SNTN.VI', 'STR': 'STR.VI',
    'TKA': 'TKA.VI', 'UQA': 'UQA.VI', 'VAS': 'VAS.VI', 'VERB': 'VERB.VI',
    'VER': 'VER.VI', 'VIG': 'VIG.VI', 'VLA': 'VLA.VI', 'WIE': 'WIE.VI',
    'ZAG': 'ZAG.VI',

    # UK Small & Mid Caps (.L)
    'ADT': 'ADT.L', 'AGT': 'AGT.L', 'ANTO': 'ANTO.L', 'ASHM': 'ASHM.L',
    'BME': 'BME.L', 'BNKR': 'BNKR.L', 'BOY': 'BOY.L', 'BRBY': 'BRBY.L',
    'BVIC': 'BVIC.L', 'CARD': 'CARD.L', 'CBG': 'CBG.L', 'CHG': 'CHG.L',
    'CLDN': 'CLDN.L', 'CMC': 'CMC.L', 'CMCX': 'CMCX.L', 'COST': 'COST.L',
    'COV': 'COV.L', 'CURY': 'CURY.L', 'CWK': 'CWK.L', 'DARK': 'DARK.L',
    'DCG': 'DCG.L', 'DIG': 'DIG.L', 'DOM': 'DOM.L', 'DPLM': 'DPLM.L',
    'DRX': 'DRX.L', 'DWHT': 'DWHT.L', 'ECM': 'ECM.L', 'EDV': 'EDV.L',
    'EMG': 'EMG.L', 'FDEV': 'FDEV.L', 'FERG': 'FERG.L', 'FLTR': 'FLTR.L',
    'FOUR': 'FOUR.L', 'FRAS': 'FRAS.L', 'FUTR': 'FUTR.L', 'GAW': 'GAW.L',
    'GFS': 'GFS.L', 'GLEN': 'GLEN.L', 'GNC': 'GNC.L', 'GNS': 'GNS.L',
    'GRG': 'GRG.L', 'GRI': 'GRI.L', 'GROW': 'GROW.L', 'GWMO': 'GWMO.L',
    'HBR': 'HBR.L', 'HIK': 'HIK.L', 'HLMA': 'HLMA.L', 'HMS': 'HMS.L',
    'HOME': 'HOME.L', 'HTWS': 'HTWS.L', 'HWDN': 'HWDN.L', 'IGG': 'IGG.L',
    'INCH': 'INCH.L', 'INF': 'INF.L', 'ITV': 'ITV.L', 'IWG': 'IWG.L',
    'JDW': 'JDW.L', 'JET2': 'JET2.L', 'JTC': 'JTC.L', 'JUST': 'JUST.L',
    'KAZ': 'KAZ.L', 'KGF': 'KGF.L', 'KNOS': 'KNOS.L', 'LAD': 'LAD.L',
    'LGEN': 'LGEN.L', 'MADE': 'MADE.L', 'MAN': 'MAN.L', 'MONY': 'MONY.L',
    'MRO': 'MRO.L', 'MTO': 'MTO.L', 'NAS': 'NAS.L', 'NCC': 'NCC.L',
    'NWG': 'NWG.L', 'NXT': 'NXT.L', 'OCDO': 'OCDO.L', 'OSB': 'OSB.L',
    'PAGE': 'PAGE.L', 'PDG': 'PDG.L', 'PFC': 'PFC.L', 'PFG': 'PFG.L',
    'PHP': 'PHP.L', 'PLUS': 'PLUS.L', 'POLY': 'POLY.L', 'PNN': 'PNN.L',
    'POL': 'POL.L', 'PPH': 'PPH.L', 'PTEC': 'PTEC.L', 'QQ': 'QQ.L',
    'RCDO': 'RCDO.L', 'RDW': 'RDW.L', 'RMV': 'RMV.L', 'RNK': 'RNK.L',
    'ROR': 'ROR.L', 'RPS': 'RPS.L', 'RSW': 'RSW.L', 'RTO': 'RTO.L',
    'RWA': 'RWA.L', 'RWS': 'RWS.L', 'SAFE': 'SAFE.L', 'SBRY': 'SBRY.L',
    'SCHO': 'SCHO.L', 'SDRY': 'SDRY.L', 'SGE': 'SGE.L', 'SGRO': 'SGRO.L',
    'SHI': 'SHI.L', 'SHED': 'SHED.L', 'SKG': 'SKG.L', 'SMDS': 'SMDS.L',
    'SMIN': 'SMIN.L', 'SMT': 'SMT.L', 'SMWH': 'SMWH.L', 'SN': 'SN.L',
    'SNN': 'SNN.L', 'SNR': 'SNR.L', 'SOPH': 'SOPH.L', 'SPE': 'SPE.L',
    'SPEC': 'SPEC.L', 'SPX': 'SPX.L', 'SRP': 'SRP.L', 'STAN': 'STAN.L',
    'STEM': 'STEM.L', 'STJ': 'STJ.L', 'STS': 'STS.L', 'SUMO': 'SUMO.L',
    'SVS': 'SVS.L', 'SXS': 'SXS.L', 'SYNT': 'SYNT.L', 'TATE': 'TATE.L',
    'TCG': 'TCG.L', 'TET': 'TET.L', 'THCG': 'THCG.L', 'TLW': 'TLW.L',
    'TRCS': 'TRCS.L', 'TRES': 'TRES.L', 'TRN': 'TRN.L', 'TSCO': 'TSCO.L',
    'TW': 'TW.L', 'ULVR': 'ULVR.L', 'UTG': 'UTG.L', 'VCT': 'VCT.L',
    'VIVO': 'VIVO.L', 'VOD': 'VOD.L', 'VTY': 'VTY.L', 'WEIR': 'WEIR.L',
    'WIX': 'WIX.L', 'WKP': 'WKP.L', 'WPP': 'WPP.L', 'WTB': 'WTB.L',
}

def get_yfinance_ticker(ticker):
    """Convert a plain ticker to yfinance-compatible ticker with exchange suffix if needed."""
    ticker_upper = ticker.upper().strip()
    # If already has a suffix (contains .), return as-is
    if '.' in ticker_upper:
        return ticker_upper
    # Check mapping
    return EUROPEAN_TICKER_MAP.get(ticker_upper, ticker_upper)

def set_db_getter(getter):
    """Set the database getter function from app.py"""
    global _db_getter
    _db_getter = getter

def _get_cached_price(ticker, date_str):
    """Get cached price from database"""
    if not _db_getter:
        return None
    try:
        with _db_getter() as conn:
            cursor = conn.execute(
                'SELECT close_price FROM historical_prices WHERE ticker = ? AND date = ?',
                (ticker, date_str)
            )
            row = cursor.fetchone()
            return row['close_price'] if row else None
    except:
        return None

def _get_cached_current_price(ticker):
    """Get cached current price if fresh (within TTL)"""
    if not _db_getter:
        return None
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        with _db_getter() as conn:
            cursor = conn.execute(
                '''SELECT close_price, created_at FROM historical_prices
                   WHERE ticker = ? AND date = ?''',
                (ticker, today)
            )
            row = cursor.fetchone()
            if row:
                # Check if cache is fresh (within TTL)
                created_at = datetime.strptime(row['created_at'], "%Y-%m-%d %H:%M:%S")
                age_minutes = (datetime.now() - created_at).total_seconds() / 60
                if age_minutes < CURRENT_PRICE_TTL_MINUTES:
                    return row['close_price']
            return None
    except Exception as e:
        print(f"Error getting cached current price: {e}")
        return None

def _save_cached_price(ticker, date_str, price):
    """Save price to cache"""
    if not _db_getter:
        return
    try:
        with _db_getter() as conn:
            conn.execute(
                'INSERT OR REPLACE INTO historical_prices (ticker, date, close_price, created_at) VALUES (?, ?, ?, ?)',
                (ticker, date_str, price, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
            )
    except Exception as e:
        print(f"Error caching price: {e}")

def _get_cached_fx_rate(pair, date_str):
    """Get cached FX rate from database"""
    if not _db_getter:
        return None
    try:
        with _db_getter() as conn:
            cursor = conn.execute(
                'SELECT rate FROM historical_fx_rates WHERE pair = ? AND date = ?',
                (pair, date_str)
            )
            row = cursor.fetchone()
            return row['rate'] if row else None
    except:
        return None

def _get_cached_current_fx_rate(pair):
    """Get cached current FX rate if fresh (within TTL)"""
    if not _db_getter:
        return None
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        with _db_getter() as conn:
            cursor = conn.execute(
                '''SELECT rate, created_at FROM historical_fx_rates
                   WHERE pair = ? AND date = ?''',
                (pair, today)
            )
            row = cursor.fetchone()
            if row:
                # Check if cache is fresh (within TTL)
                created_at = datetime.strptime(row['created_at'], "%Y-%m-%d %H:%M:%S")
                age_minutes = (datetime.now() - created_at).total_seconds() / 60
                if age_minutes < CURRENT_PRICE_TTL_MINUTES:
                    return row['rate']
            return None
    except Exception as e:
        print(f"Error getting cached current FX rate: {e}")
        return None

def _save_cached_fx_rate(pair, date_str, rate):
    """Save FX rate to cache"""
    if not _db_getter:
        return
    try:
        with _db_getter() as conn:
            conn.execute(
                'INSERT OR REPLACE INTO historical_fx_rates (pair, date, rate, created_at) VALUES (?, ?, ?, ?)',
                (pair, date_str, rate, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
            )
    except Exception as e:
        print(f"Error caching FX rate: {e}")

# Stock color map for pie chart - brand colors where available
STOCK_COLORS = {
    # US Tech
    'NVDA': "#76B900",
    'GOOGL': "#DB4437",
    'GOOG': "#DB4437",
    'AMZN': "#FF9900",
    'META': "#4267B2",
    'MSFT': "#00A4EF",
    'AAPL': "#555555",
    'TSLA': "#CC0000",
    'V': "#1A1F71",
    'NFLX': "#E50914",
    'PYPL': "#003087",
    'INTC': "#0071C5",
    'AMD': "#ED1C24",
    'CRM': "#00A1E0",
    'ADBE': "#FF0000",
    'ORCL': "#F80000",
    'IBM': "#0530AD",
    'CSCO': "#049FD9",
    # US Finance
    'JPM': "#0A5CA8",
    'BAC': "#012169",
    'GS': "#7399C6",
    'MS': "#002E5D",
    'WFC': "#D71E28",
    'C': "#003DA5",
    'AXP': "#006FCF",
    'MA': "#EB001B",
    'BLK': "#000000",
    # US Consumer
    'WMT': "#0071CE",
    'HD': "#F96302",
    'NKE': "#111111",
    'SBUX': "#00704A",
    'MCD': "#FFC72C",
    'KO': "#F40009",
    'PEP': "#004B93",
    'DIS': "#113CCF",
    # US Healthcare
    'JNJ': "#D51900",
    'PFE': "#0093D0",
    'UNH': "#002677",
    'MRK': "#00857C",
    'ABBV': "#071D49",
    'LLY': "#D52B1E",
    # European
    'ASML': "#003E7E",
    'SAP': "#008FD3",
    'LVMH': "#8B6914",
    'MC': "#8B6914",  # LVMH ticker
    # Swiss - using vibrant distinct colors
    'NESN': "#7B9A6D",  # Nestle
    'NOVN': "#E55300",  # Novartis
    'ROG': "#0066CC",  # Roche
    'UHR': "#FF9900",  # Swatch - orange like AMZN
    'UBSG': "#E60000",  # UBS
    'SQN': "#76B900",  # Swissquote - green like NVDA
    'ZURN': "#003399",  # Zurich Insurance
    'ABBN': "#FF000F",  # ABB
    'CFR': "#7B3F00",  # Richemont
    'LONN': "#0033A0",  # Lonza
    'SIKA': "#FFCC00",  # Sika
    'GEBN': "#009FE3",  # Geberit
    'GIVN': "#DB4437",  # Givaudan
    'HOLN': "#003366",  # Holcim
    'BAER': "#002B5C",  # Julius Baer
    'LOGN': "#00B8FC",  # Logitech
    'ENX': "#4267B2",  # Euronext - blue like META
    # Other
    'Cash': "#FFD700",
}

# Benchmark tickers
BENCHMARKS = {
    'SP500': '^GSPC',
    'QQQ': 'QQQ'
}


def fetch_stock_price(stock_ticker, date_str):
    """Fetch stock closing price for a given date (with caching)."""
    # Check cache first (use original ticker for cache key)
    cached = _get_cached_price(stock_ticker, date_str)
    if cached is not None:
        return cached

    # Convert to yfinance ticker (add exchange suffix if needed)
    yf_ticker = get_yfinance_ticker(stock_ticker)
    ticker = yf.Ticker(yf_ticker)
    end_date = datetime.strptime(date_str, "%Y-%m-%d")
    start_date = (end_date - timedelta(days=7)).strftime('%Y-%m-%d')
    prices_history = ticker.history(start=start_date, end=date_str)
    if prices_history.empty:
        # Try fetching more days back
        start_date = (end_date - timedelta(days=14)).strftime('%Y-%m-%d')
        prices_history = ticker.history(start=start_date, end=date_str)
    if prices_history.empty:
        raise ValueError(f"No price data found for {stock_ticker} around {date_str}")

    price = round(prices_history["Close"].values[-1], 2)

    # Save to cache (only for past dates, not today)
    today = datetime.now().strftime("%Y-%m-%d")
    if date_str < today:
        _save_cached_price(stock_ticker, date_str, price)

    return price


def fetch_current_stock_price(stock_ticker):
    """Fetch current stock price (with 15-min TTL caching)."""
    # Check cache first (use original ticker for cache key)
    cached = _get_cached_current_price(stock_ticker)
    if cached is not None:
        return cached

    # Convert to yfinance ticker (add exchange suffix if needed)
    yf_ticker = get_yfinance_ticker(stock_ticker)
    ticker = yf.Ticker(yf_ticker)
    info = ticker.info
    # Try multiple price fields
    price = info.get('regularMarketPrice') or info.get('currentPrice') or info.get('previousClose')
    if price is None:
        # Fallback to history
        hist = ticker.history(period='1d')
        if not hist.empty:
            price = hist['Close'].iloc[-1]

    if price:
        price = round(float(price), 2)
        # Save to cache with today's date
        today = datetime.now().strftime("%Y-%m-%d")
        _save_cached_price(stock_ticker, today, price)

    return price


def fetch_current_stock_prices_batch(tickers):
    """
    Fetch current prices for multiple tickers in a single API call.
    Returns: dict mapping ticker -> price (using original ticker names as keys)
    """
    if not tickers:
        return {}

    prices = {}
    tickers_to_fetch = []
    ticker_mapping = {}  # yf_ticker -> original_ticker

    # First check cache for each ticker
    for ticker in tickers:
        cached = _get_cached_current_price(ticker)
        if cached is not None:
            prices[ticker] = cached
        else:
            yf_ticker = get_yfinance_ticker(ticker)
            tickers_to_fetch.append(yf_ticker)
            ticker_mapping[yf_ticker] = ticker

    if not tickers_to_fetch:
        return prices

    try:
        # Batch download - single API call for all tickers
        data = yf.download(
            tickers_to_fetch,
            period='1d',
            progress=False,
            threads=True
        )

        today = datetime.now().strftime("%Y-%m-%d")

        if len(tickers_to_fetch) == 1:
            # Single ticker returns different structure
            yf_ticker = tickers_to_fetch[0]
            original_ticker = ticker_mapping[yf_ticker]
            if not data.empty and 'Close' in data.columns:
                price = round(float(data['Close'].iloc[-1]), 2)
                prices[original_ticker] = price
                _save_cached_price(original_ticker, today, price)
        else:
            # Multiple tickers - columns are MultiIndex
            for yf_ticker in tickers_to_fetch:
                original_ticker = ticker_mapping[yf_ticker]
                try:
                    if yf_ticker in data['Close'].columns:
                        close_val = data['Close'][yf_ticker].iloc[-1]
                        if not pd.isna(close_val):
                            price = round(float(close_val), 2)
                            prices[original_ticker] = price
                            _save_cached_price(original_ticker, today, price)
                except (KeyError, IndexError):
                    pass
    except Exception as e:
        print(f"Error in batch price fetch: {e}")

    # Fallback: fetch remaining tickers individually
    for ticker in tickers:
        if ticker not in prices:
            try:
                price = fetch_current_stock_price(ticker)
                if price:
                    prices[ticker] = price
            except Exception:
                prices[ticker] = 0

    return prices


def fetch_eurusd_rate(date_str):
    """Fetch EUR/USD exchange rate for a given date (with caching)."""
    # Check cache first
    cached = _get_cached_fx_rate('EURUSD', date_str)
    if cached is not None:
        return cached

    # Fetch from API
    eurusd = yf.Ticker("EURUSD=X")
    date = datetime.strptime(date_str, "%Y-%m-%d")
    end_date = (date + timedelta(days=7)).strftime('%Y-%m-%d')
    fx_rate_data = eurusd.history(start=date_str, end=end_date)
    if fx_rate_data.empty:
        # Try current rate
        fx_rate_data = eurusd.history(period='1d')
    if fx_rate_data.empty:
        return 1.0  # Fallback

    rate = float(np.round((fx_rate_data["Open"].values[0] + fx_rate_data["Close"].values[0]) / 2, 4))

    # Save to cache (only for past dates, not today)
    today = datetime.now().strftime("%Y-%m-%d")
    if date_str < today:
        _save_cached_fx_rate('EURUSD', date_str, rate)

    return rate


def get_current_eurusd_rate():
    """Fetch current EUR/USD exchange rate (with 15-min TTL caching)."""
    # Check cache first
    cached = _get_cached_current_fx_rate('EURUSD')
    if cached is not None:
        return cached

    # Fetch from API
    eurusd = yf.Ticker("EURUSD=X")
    info = eurusd.info
    rate = info.get('regularMarketPrice') or info.get('previousClose')
    if rate is None:
        hist = eurusd.history(period='1d')
        if not hist.empty:
            rate = hist['Close'].iloc[-1]

    if rate:
        rate = float(round(rate, 4))
        # Save to cache with today's date
        today = datetime.now().strftime("%Y-%m-%d")
        _save_cached_fx_rate('EURUSD', today, rate)
        return rate

    return 1.0


def get_previous_weekday(date=None):
    """Get the previous weekday from a given date (or today if None)."""
    if date is None:
        date = datetime.now()
    elif isinstance(date, str):
        date = datetime.strptime(date, "%Y-%m-%d")

    current_day = date
    # Keep going back until we hit a weekday (Mon-Fri)
    while current_day.weekday() >= 5:  # 5=Saturday, 6=Sunday
        current_day -= timedelta(days=1)
    return current_day.strftime("%Y-%m-%d")


def compute_portfolio_composition(holdings):
    """
    Compute portfolio composition with current values, weights, cost basis and gains.

    Args:
        holdings: list of dicts with 'stock_ticker', 'quantity', 'cost_basis' (avg price),
                  'total_cost' (USD), 'total_cost_eur' (EUR at historical rates)

    Returns:
        dict with composition data including gains/losses
    """
    composition = []
    total_value = 0
    total_cost_basis_usd = 0
    total_cost_basis_eur = 0

    # Batch fetch all prices in a single API call
    all_tickers = [h['stock_ticker'] for h in holdings]
    prices = fetch_current_stock_prices_batch(all_tickers)

    for holding in holdings:
        ticker = holding['stock_ticker']
        quantity = holding['quantity']
        cost_basis_per_share = holding.get('cost_basis', 0)
        total_cost = holding.get('total_cost', cost_basis_per_share * quantity)
        total_cost_eur = holding.get('total_cost_eur', total_cost)  # Fallback to USD if not provided

        current_price = prices.get(ticker, 0) or 0
        current_value = current_price * quantity
        gain_usd = current_value - total_cost
        gain_pct = round(100 * gain_usd / total_cost, 1) if total_cost > 0 else 0

        composition.append({
            'ticker': ticker,
            'quantity': quantity,
            'current_price': current_price,
            'current_value': round(current_value, 2),
            'cost_basis': round(total_cost, 2),
            'cost_basis_eur': round(total_cost_eur, 2),
            'avg_cost': round(cost_basis_per_share, 2),
            'gain_usd': round(gain_usd, 2),
            'gain_pct': gain_pct,
            'color': STOCK_COLORS.get(ticker, '#95A5A6')
        })
        total_value += current_value
        total_cost_basis_usd += total_cost
        total_cost_basis_eur += total_cost_eur

    # Calculate weights
    for item in composition:
        if total_value > 0:
            item['weight'] = round(100 * item['current_value'] / total_value, 1)
        else:
            item['weight'] = 0

    # Sort by weight descending
    composition.sort(key=lambda x: -x['weight'])

    # Get EUR values
    eurusd_rate = get_current_eurusd_rate()
    total_value_eur = round(total_value / eurusd_rate, 2)
    total_gain_usd = total_value - total_cost_basis_usd
    total_gain_pct = round(100 * total_gain_usd / total_cost_basis_usd, 1) if total_cost_basis_usd > 0 else 0

    return {
        'holdings': composition,
        'total_value_usd': round(total_value, 2),
        'total_value_eur': total_value_eur,
        'total_cost_basis': round(total_cost_basis_usd, 2),
        'total_cost_basis_eur': round(total_cost_basis_eur, 2),
        'total_gain_usd': round(total_gain_usd, 2),
        'total_gain_pct': total_gain_pct,
        'eurusd_rate': eurusd_rate
    }


def compute_portfolio_performance_from_transactions(transactions, benchmark_ticker='QQQ'):
    """
    Compute portfolio performance vs benchmark over time, tracking actual holdings.

    Args:
        transactions: list of dicts with 'stock_ticker', 'transaction_type', 'quantity',
                      'transaction_date', 'price_per_share'
        benchmark_ticker: ticker symbol for benchmark (e.g., 'QQQ', 'EQQQ.DE', 'SPY', 'CSPX.L')

    Returns:
        dict with performance data
    """
    if not transactions:
        return {'error': 'No transactions provided', 'data': []}

    # Sort transactions by date
    sorted_txs = sorted(transactions, key=lambda x: x['transaction_date'])

    # Get date range
    start_date_str = sorted_txs[0]['transaction_date']
    end_date = datetime.now()
    end_date_str = get_previous_weekday(end_date)

    # Generate weekly dates
    weekly_dates = []
    current_date = datetime.strptime(start_date_str, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date_str, "%Y-%m-%d")

    while current_date <= end_dt:
        weekly_dates.append(current_date.strftime("%Y-%m-%d"))
        current_date += timedelta(weeks=1)

    # Always include the end date
    if weekly_dates[-1] != end_date_str:
        weekly_dates.append(end_date_str)

    # Track benchmark shares bought (as if we invested the same EUR in benchmark at each transaction)
    # Pre-calculate: for each transaction, how many benchmark shares we'd get
    tx_benchmark_info = []
    transaction_events = []  # For chart markers

    for tx in sorted_txs:
        tx_date = tx['transaction_date']
        tx_cost_usd = tx['quantity'] * tx['price_per_share']

        if tx['transaction_type'] == 'BUY':
            try:
                # Convert to EUR at transaction date
                eurusd_at_tx = fetch_eurusd_rate(tx_date)
                tx_cost_eur = tx_cost_usd / eurusd_at_tx

                benchmark_price_at_tx = fetch_stock_price(benchmark_ticker, tx_date)
                # Buy benchmark with the same USD amount (to compare apples to apples)
                benchmark_shares_bought = tx_cost_usd / benchmark_price_at_tx

                tx_benchmark_info.append({
                    'date': tx_date,
                    'type': 'BUY',
                    'cost_usd': tx_cost_usd,
                    'cost_eur': tx_cost_eur,
                    'benchmark_shares': benchmark_shares_bought
                })

                # Track transaction event for chart marker
                transaction_events.append({
                    'date': tx_date,
                    'ticker': tx['stock_ticker'],
                    'type': 'BUY',
                    'quantity': tx['quantity']
                })
            except Exception as e:
                print(f"Error processing transaction: {e}")
                tx_benchmark_info.append({
                    'date': tx_date,
                    'type': 'BUY',
                    'cost_usd': tx_cost_usd,
                    'cost_eur': tx_cost_usd,  # Fallback
                    'benchmark_shares': 0
                })
        else:  # SELL
            try:
                # Convert sale proceeds to EUR at transaction date
                eurusd_at_tx = fetch_eurusd_rate(tx_date)
                tx_proceeds_eur = tx_cost_usd / eurusd_at_tx

                # Also sell equivalent USD worth of benchmark shares
                benchmark_price_at_tx = fetch_stock_price(benchmark_ticker, tx_date)
                benchmark_shares_sold = tx_cost_usd / benchmark_price_at_tx
            except:
                tx_proceeds_eur = tx_cost_usd  # Fallback
                benchmark_shares_sold = 0

            tx_benchmark_info.append({
                'date': tx_date,
                'type': 'SELL',
                'cost_usd': -tx_cost_usd,
                'cost_eur': -tx_proceeds_eur,  # Negative because money is coming OUT
                'benchmark_shares': -benchmark_shares_sold  # Negative - selling benchmark shares too
            })
            transaction_events.append({
                'date': tx_date,
                'ticker': tx['stock_ticker'],
                'type': 'SELL',
                'quantity': tx['quantity']
            })

    # Calculate performance data
    performance_data = []

    for date_str in weekly_dates:
        date_dt = datetime.strptime(date_str, "%Y-%m-%d")

        # Calculate holdings at this date using FIFO
        # Track lots per ticker: list of { qty, cost_usd_per_share, cost_eur }
        lots_per_ticker = {}  # ticker -> list of lots
        holdings_at_date = {}  # ticker -> total quantity
        benchmark_shares_at_date = 0

        for i, tx in enumerate(sorted_txs):
            tx_date_dt = datetime.strptime(tx['transaction_date'], "%Y-%m-%d")
            if tx_date_dt > date_dt:
                break

            ticker = tx['stock_ticker']
            if ticker not in lots_per_ticker:
                lots_per_ticker[ticker] = []
                holdings_at_date[ticker] = 0

            if tx['transaction_type'] == 'BUY':
                holdings_at_date[ticker] += tx['quantity']
                tx_cost_usd = tx['quantity'] * tx['price_per_share']
                tx_cost_eur = tx_benchmark_info[i]['cost_eur']
                lots_per_ticker[ticker].append({
                    'qty': tx['quantity'],
                    'cost_usd_per_share': tx['price_per_share'],
                    'cost_eur': tx_cost_eur
                })
                benchmark_shares_at_date += tx_benchmark_info[i]['benchmark_shares']
            else:  # SELL - use FIFO
                sell_qty = tx['quantity']
                holdings_at_date[ticker] -= sell_qty
                remaining_sell = sell_qty

                # FIFO: consume oldest lots first
                while remaining_sell > 0 and lots_per_ticker[ticker]:
                    lot = lots_per_ticker[ticker][0]
                    sell_from_lot = min(remaining_sell, lot['qty'])

                    # Reduce lot proportionally
                    if sell_from_lot == lot['qty']:
                        lots_per_ticker[ticker].pop(0)
                    else:
                        portion = sell_from_lot / lot['qty']
                        lot['cost_eur'] *= (1 - portion)
                        lot['qty'] -= sell_from_lot

                    remaining_sell -= sell_from_lot

                # Benchmark shares also reduce
                benchmark_shares_at_date += tx_benchmark_info[i]['benchmark_shares']

        # Calculate cost basis from remaining lots
        cost_basis_at_date = 0
        cost_basis_eur_at_date = 0
        for ticker, lots in lots_per_ticker.items():
            for lot in lots:
                cost_basis_at_date += lot['qty'] * lot['cost_usd_per_share']
                cost_basis_eur_at_date += lot['cost_eur']

        # Skip if no holdings yet
        if not holdings_at_date or cost_basis_at_date <= 0:
            continue

        try:
            # Calculate portfolio value at this date
            # Use current prices for the last data point to match composition endpoint
            is_last_date = (date_str == weekly_dates[-1])
            portfolio_value = 0
            for ticker, qty in holdings_at_date.items():
                if qty > 0:
                    if is_last_date:
                        price = fetch_current_stock_price(ticker)
                    else:
                        price = fetch_stock_price(ticker, date_str)
                    portfolio_value += price * qty

            # Calculate benchmark value (what if we'd invested in benchmark instead)
            if is_last_date:
                benchmark_price = fetch_current_stock_price(benchmark_ticker)
            else:
                benchmark_price = fetch_stock_price(benchmark_ticker, date_str)
            benchmark_value = benchmark_shares_at_date * benchmark_price

            # EUR conversion - use current rate for last date
            if is_last_date:
                eurusd = get_current_eurusd_rate()
            else:
                eurusd = fetch_eurusd_rate(date_str)
            portfolio_value_eur = portfolio_value / eurusd
            benchmark_value_eur = benchmark_value / eurusd
            # Use the EUR amount invested at transaction dates (doesn't fluctuate with FX)
            cost_basis_eur = cost_basis_eur_at_date

            # Growth percentages
            portfolio_growth = 100 * portfolio_value / cost_basis_at_date if cost_basis_at_date > 0 else 100
            benchmark_growth = 100 * benchmark_value / cost_basis_at_date if cost_basis_at_date > 0 else 100

            performance_data.append({
                'date': date_str,
                'portfolio_value_usd': round(portfolio_value, 2),
                'portfolio_value_eur': round(portfolio_value_eur, 2),
                'benchmark_value_usd': round(benchmark_value, 2),
                'benchmark_value_eur': round(benchmark_value_eur, 2),
                'cost_basis_usd': round(cost_basis_at_date, 2),
                'cost_basis_eur': round(cost_basis_eur, 2),
                'portfolio_growth_usd': round(portfolio_growth, 1),
                'portfolio_growth_eur': round(portfolio_growth, 1),
                'benchmark_growth_usd': round(benchmark_growth, 1),
                'benchmark_growth_eur': round(benchmark_growth, 1),
            })
        except Exception as e:
            print(f"Error computing performance for {date_str}: {e}")
            continue

    if not performance_data:
        return {'error': 'Failed to compute performance data', 'data': []}

    # Calculate summary stats
    first = performance_data[0]
    last = performance_data[-1]

    total_return_eur = round(100 * (last['portfolio_value_eur'] - last['cost_basis_eur']) / last['cost_basis_eur'], 1)
    benchmark_return_eur = round(100 * (last['benchmark_value_eur'] - last['cost_basis_eur']) / last['cost_basis_eur'], 1)

    # Calculate CAGR (Compound Annual Growth Rate)
    start_dt = datetime.strptime(first['date'], "%Y-%m-%d")
    end_dt = datetime.strptime(last['date'], "%Y-%m-%d")
    years = (end_dt - start_dt).days / 365.25

    if years > 0 and last['portfolio_value_eur'] > 0 and first['cost_basis_eur'] > 0:
        # CAGR = (ending/beginning)^(1/years) - 1
        cagr_eur = (pow(last['portfolio_value_eur'] / last['cost_basis_eur'], 1 / years) - 1) * 100
        cagr_benchmark_eur = (pow(last['benchmark_value_eur'] / last['cost_basis_eur'], 1 / years) - 1) * 100
    else:
        cagr_eur = total_return_eur
        cagr_benchmark_eur = benchmark_return_eur

    return {
        'data': performance_data,
        'transactions': transaction_events,
        'summary': {
            'start_date': first['date'],
            'end_date': last['date'],
            'total_cost_basis_eur': round(last['cost_basis_eur'], 2),
            'portfolio_return_eur': total_return_eur,
            'benchmark_return_eur': benchmark_return_eur,
            'outperformance_eur': round(total_return_eur - benchmark_return_eur, 1),
            'cagr_eur': round(cagr_eur, 1),
            'cagr_benchmark_eur': round(cagr_benchmark_eur, 1),
            'years': round(years, 2),
            'benchmark': benchmark_ticker
        }
    }


# =============================================================================
# YouTube News Feed Functions
# =============================================================================

import requests
from youtube_config import YOUTUBE_CHANNELS, get_uploads_playlist_id, matches_company

# Cache TTL for YouTube videos (6 hours)
YOUTUBE_CACHE_TTL_HOURS = 6


def fetch_channel_videos(channel_id, api_key, max_results=50):
    """
    Fetch recent videos from a YouTube channel using playlistItems API (1 unit cost).
    Returns list of video metadata.
    """
    uploads_playlist_id = get_uploads_playlist_id(channel_id)

    url = "https://www.googleapis.com/youtube/v3/playlistItems"
    params = {
        'part': 'snippet',
        'playlistId': uploads_playlist_id,
        'maxResults': max_results,
        'key': api_key
    }

    response = requests.get(url, params=params)
    response.raise_for_status()
    data = response.json()

    videos = []
    for item in data.get('items', []):
        snippet = item['snippet']
        video_id = snippet['resourceId']['videoId']

        videos.append({
            'video_id': video_id,
            'channel_id': channel_id,
            'channel_name': snippet['channelTitle'],
            'title': snippet['title'],
            'thumbnail_url': snippet['thumbnails'].get('high', {}).get('url') or
                            snippet['thumbnails'].get('medium', {}).get('url') or
                            snippet['thumbnails'].get('default', {}).get('url'),
            'published_at': snippet['publishedAt'],
        })

    return videos


def fetch_all_channel_videos(api_key, max_per_channel=50):
    """
    Fetch videos from all configured channels.
    Returns combined list of videos sorted by publish date.
    """
    all_videos = []

    for channel_id, channel_info in YOUTUBE_CHANNELS.items():
        try:
            videos = fetch_channel_videos(channel_id, api_key, max_per_channel)
            all_videos.extend(videos)
        except Exception as e:
            print(f"Error fetching videos from {channel_info.get('name', channel_id)}: {e}")
            continue

    # Sort by publish date (most recent first)
    all_videos.sort(key=lambda x: x['published_at'], reverse=True)

    return all_videos


def get_cached_videos(db_getter):
    """Get cached videos from database, filtered to allowed channels only."""
    allowed_channel_ids = list(YOUTUBE_CHANNELS.keys())
    if not allowed_channel_ids:
        return []

    placeholders = ','.join('?' * len(allowed_channel_ids))
    with db_getter() as conn:
        cursor = conn.execute(f'''
            SELECT video_id, channel_id, channel_name, title, thumbnail_url,
                   published_at, view_count, updated_at
            FROM youtube_videos_cache
            WHERE channel_id IN ({placeholders})
            ORDER BY published_at DESC
        ''', allowed_channel_ids)
        rows = cursor.fetchall()

    return [dict(row) for row in rows]


def save_videos_to_cache(db_getter, videos):
    """Save videos to cache (upsert)."""
    with db_getter() as conn:
        for video in videos:
            conn.execute('''
                INSERT INTO youtube_videos_cache
                    (video_id, channel_id, channel_name, title, thumbnail_url, published_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(video_id) DO UPDATE SET
                    title = excluded.title,
                    thumbnail_url = excluded.thumbnail_url,
                    updated_at = CURRENT_TIMESTAMP
            ''', (
                video['video_id'],
                video['channel_id'],
                video['channel_name'],
                video['title'],
                video['thumbnail_url'],
                video['published_at']
            ))


def should_refresh_cache(db_getter, channel_id):
    """Check if channel's cache is stale and needs refresh."""
    with db_getter() as conn:
        cursor = conn.execute('''
            SELECT last_fetched_at FROM youtube_channel_fetch_log
            WHERE channel_id = ?
        ''', (channel_id,))
        row = cursor.fetchone()

        if not row:
            return True

        last_fetched = datetime.fromisoformat(row['last_fetched_at'])
        age_hours = (datetime.now() - last_fetched).total_seconds() / 3600

        return age_hours >= YOUTUBE_CACHE_TTL_HOURS


def mark_channel_fetched(db_getter, channel_id):
    """Update the fetch timestamp for a channel."""
    with db_getter() as conn:
        conn.execute('''
            INSERT INTO youtube_channel_fetch_log (channel_id, last_fetched_at)
            VALUES (?, CURRENT_TIMESTAMP)
            ON CONFLICT(channel_id) DO UPDATE SET
                last_fetched_at = CURRENT_TIMESTAMP
        ''', (channel_id,))


def get_news_feed_videos(db_getter, api_key, ticker=None, company_name=None, limit=50):
    """
    Get news feed videos, refreshing cache if needed.
    Optionally filters by ticker and company_name.

    Returns: { 'videos': [...], 'from_cache': bool }
    """
    # Check if any channel needs refresh
    channels_to_refresh = []
    for channel_id in YOUTUBE_CHANNELS.keys():
        if should_refresh_cache(db_getter, channel_id):
            channels_to_refresh.append(channel_id)

    # Refresh stale channels
    if channels_to_refresh and api_key:
        for channel_id in channels_to_refresh:
            try:
                videos = fetch_channel_videos(channel_id, api_key)
                save_videos_to_cache(db_getter, videos)
                mark_channel_fetched(db_getter, channel_id)
            except Exception as e:
                print(f"Error refreshing channel {channel_id}: {e}")

    # Get all cached videos
    all_videos = get_cached_videos(db_getter)

    # Filter by ticker/company if specified
    if ticker:
        filtered = [v for v in all_videos if matches_company(v['title'], ticker, company_name)]
    else:
        filtered = all_videos

    # Add YouTube URL and limit results
    for video in filtered[:limit]:
        video['url'] = f"https://www.youtube.com/watch?v={video['video_id']}"

    return {
        'videos': filtered[:limit],
        'total': len(filtered),
        'from_cache': len(channels_to_refresh) == 0
    }
