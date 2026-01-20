#!/usr/bin/env python3
"""
Script to expand and fix the stocks.json database.
Adds missing markets (Toronto, Australian, Hong Kong, Tokyo, Singapore)
and fixes data errors.
"""

import json
import os

STOCKS_FILE = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'src', 'data', 'stocks.json')

def load_stocks():
    with open(STOCKS_FILE, 'r') as f:
        return json.load(f)

def save_stocks(stocks):
    # Sort by ticker
    sorted_stocks = dict(sorted(stocks.items()))
    with open(STOCKS_FILE, 'w') as f:
        json.dump(sorted_stocks, f, indent=2)
    print(f"Saved {len(stocks)} stocks to {STOCKS_FILE}")

# ============================================================================
# DATA FIXES
# ============================================================================

DATA_FIXES = {
    # Fix BOL - should be Boliden (Stockholm), not Bollore
    "BOL": {
        "name": "Boliden",
        "yfinance": "BOL.ST",
        "region": "europe",
        "ir": "https://www.boliden.com/investor-relations",
        "logo": "boliden.com"
    },
    # Fix NEM - Nemetschek SE (German software), IR was wrong
    "NEM": {
        "name": "Nemetschek SE",
        "yfinance": "NEM.DE",
        "region": "europe",
        "ir": "https://www.nemetschek.com/en/investor-relations",
        "logo": "nemetschek.com"
    },
}

# ============================================================================
# MISSING MAJOR US STOCKS
# ============================================================================

MISSING_US_STOCKS = {
    # Gold & Mining
    "GOLD": {
        "name": "Barrick Gold",
        "yfinance": "GOLD",
        "region": "us",
        "ir": "https://www.barrick.com/investors",
        "logo": "barrick.com"
    },
    "NEM_US": {  # Using NEM_US since NEM is taken by Nemetschek
        "name": "Newmont",
        "yfinance": "NEM",
        "region": "us",
        "ir": "https://www.newmont.com/investors",
        "logo": "newmont.com"
    },
    "FCX": {
        "name": "Freeport-McMoRan",
        "yfinance": "FCX",
        "region": "us",
        "ir": "https://investors.fcx.com",
        "logo": "fcx.com"
    },
    "AEM": {
        "name": "Agnico Eagle Mines",
        "yfinance": "AEM",
        "region": "us",
        "ir": "https://www.agnicoeagle.com/English/investor-relations",
        "logo": "agnicoeagle.com"
    },
    "WPM": {
        "name": "Wheaton Precious Metals",
        "yfinance": "WPM",
        "region": "us",
        "ir": "https://www.wheatonpm.com/investors",
        "logo": "wheatonpm.com"
    },
    "KGC": {
        "name": "Kinross Gold",
        "yfinance": "KGC",
        "region": "us",
        "ir": "https://www.kinross.com/investors",
        "logo": "kinross.com"
    },
    "AU": {
        "name": "AngloGold Ashanti",
        "yfinance": "AU",
        "region": "us",
        "ir": "https://www.anglogoldashanti.com/investors",
        "logo": "anglogoldashanti.com"
    },
    "FNV": {
        "name": "Franco-Nevada",
        "yfinance": "FNV",
        "region": "us",
        "ir": "https://www.franco-nevada.com/investors",
        "logo": "franco-nevada.com"
    },
    "RGLD": {
        "name": "Royal Gold",
        "yfinance": "RGLD",
        "region": "us",
        "ir": "https://www.royalgold.com/investors",
        "logo": "royalgold.com"
    },
    "PAAS": {
        "name": "Pan American Silver",
        "yfinance": "PAAS",
        "region": "us",
        "ir": "https://www.panamericansilver.com/investors",
        "logo": "panamericansilver.com"
    },
    "HL": {
        "name": "Hecla Mining",
        "yfinance": "HL",
        "region": "us",
        "ir": "https://www.hecla.com/investors",
        "logo": "hecla.com"
    },
    "CLF": {
        "name": "Cleveland-Cliffs",
        "yfinance": "CLF",
        "region": "us",
        "ir": "https://www.clevelandcliffs.com/investors",
        "logo": "clevelandcliffs.com"
    },
    "NUE": {
        "name": "Nucor",
        "yfinance": "NUE",
        "region": "us",
        "ir": "https://www.nucor.com/investors",
        "logo": "nucor.com"
    },
    "SCCO": {
        "name": "Southern Copper",
        "yfinance": "SCCO",
        "region": "us",
        "ir": "https://www.southerncoppercorp.com/ENG/investors",
        "logo": "southerncoppercorp.com"
    },
    "TECK": {
        "name": "Teck Resources",
        "yfinance": "TECK",
        "region": "us",
        "ir": "https://www.teck.com/investors",
        "logo": "teck.com"
    },
    "MP": {
        "name": "MP Materials",
        "yfinance": "MP",
        "region": "us",
        "ir": "https://investors.mpmaterials.com",
        "logo": "mpmaterials.com"
    },
    "ALB": {
        "name": "Albemarle",
        "yfinance": "ALB",
        "region": "us",
        "ir": "https://investors.albemarle.com",
        "logo": "albemarle.com"
    },
    "SQM": {
        "name": "Sociedad Quimica y Minera de Chile",
        "yfinance": "SQM",
        "region": "us",
        "ir": "https://www.sqm.com/en/inversionistas",
        "logo": "sqm.com"
    },
    "LAC": {
        "name": "Lithium Americas",
        "yfinance": "LAC",
        "region": "us",
        "ir": "https://www.lithiumamericas.com/investors",
        "logo": "lithiumamericas.com"
    },
    "LTHM": {
        "name": "Livent",
        "yfinance": "LTHM",
        "region": "us",
        "ir": "https://ir.livent.com",
        "logo": "livent.com"
    },
}

# ============================================================================
# TORONTO STOCK EXCHANGE (.TO) - Major Canadian Stocks
# ============================================================================

TORONTO_STOCKS = {
    # Banks
    "RY.TO": {
        "name": "Royal Bank of Canada",
        "yfinance": "RY.TO",
        "region": "canada",
        "ir": "https://www.rbc.com/investor-relations",
        "logo": "rbc.com"
    },
    "TD.TO": {
        "name": "Toronto-Dominion Bank",
        "yfinance": "TD.TO",
        "region": "canada",
        "ir": "https://www.td.com/investor-relations",
        "logo": "td.com"
    },
    "BNS.TO": {
        "name": "Bank of Nova Scotia",
        "yfinance": "BNS.TO",
        "region": "canada",
        "ir": "https://www.scotiabank.com/ca/en/about/investors-shareholders.html",
        "logo": "scotiabank.com"
    },
    "BMO.TO": {
        "name": "Bank of Montreal",
        "yfinance": "BMO.TO",
        "region": "canada",
        "ir": "https://www.bmo.com/main/about-bmo/investor-relations",
        "logo": "bmo.com"
    },
    "CM.TO": {
        "name": "Canadian Imperial Bank of Commerce",
        "yfinance": "CM.TO",
        "region": "canada",
        "ir": "https://www.cibc.com/en/about-cibc/investor-relations.html",
        "logo": "cibc.com"
    },
    "NA.TO": {
        "name": "National Bank of Canada",
        "yfinance": "NA.TO",
        "region": "canada",
        "ir": "https://www.nbc.ca/en/about-us/investor-relations.html",
        "logo": "nbc.ca"
    },
    # Energy
    "ENB.TO": {
        "name": "Enbridge",
        "yfinance": "ENB.TO",
        "region": "canada",
        "ir": "https://www.enbridge.com/investment-center",
        "logo": "enbridge.com"
    },
    "TRP.TO": {
        "name": "TC Energy",
        "yfinance": "TRP.TO",
        "region": "canada",
        "ir": "https://www.tcenergy.com/investors",
        "logo": "tcenergy.com"
    },
    "CNQ.TO": {
        "name": "Canadian Natural Resources",
        "yfinance": "CNQ.TO",
        "region": "canada",
        "ir": "https://www.cnrl.com/investor-information",
        "logo": "cnrl.com"
    },
    "SU.TO": {
        "name": "Suncor Energy",
        "yfinance": "SU.TO",
        "region": "canada",
        "ir": "https://www.suncor.com/en/investors",
        "logo": "suncor.com"
    },
    "IMO.TO": {
        "name": "Imperial Oil",
        "yfinance": "IMO.TO",
        "region": "canada",
        "ir": "https://www.imperialoil.ca/en-CA/company/investors",
        "logo": "imperialoil.ca"
    },
    "CVE.TO": {
        "name": "Cenovus Energy",
        "yfinance": "CVE.TO",
        "region": "canada",
        "ir": "https://www.cenovus.com/investors",
        "logo": "cenovus.com"
    },
    "PPL.TO": {
        "name": "Pembina Pipeline",
        "yfinance": "PPL.TO",
        "region": "canada",
        "ir": "https://www.pembina.com/investors",
        "logo": "pembina.com"
    },
    # Mining - Gold
    "ABX.TO": {
        "name": "Barrick Gold",
        "yfinance": "ABX.TO",
        "region": "canada",
        "ir": "https://www.barrick.com/investors",
        "logo": "barrick.com"
    },
    "AEM.TO": {
        "name": "Agnico Eagle Mines",
        "yfinance": "AEM.TO",
        "region": "canada",
        "ir": "https://www.agnicoeagle.com/English/investor-relations",
        "logo": "agnicoeagle.com"
    },
    "K.TO": {
        "name": "Kinross Gold",
        "yfinance": "K.TO",
        "region": "canada",
        "ir": "https://www.kinross.com/investors",
        "logo": "kinross.com"
    },
    "G.TO": {
        "name": "B2Gold",
        "yfinance": "G.TO",
        "region": "canada",
        "ir": "https://www.b2gold.com/investors",
        "logo": "b2gold.com"
    },
    "ELD.TO": {
        "name": "Eldorado Gold",
        "yfinance": "ELD.TO",
        "region": "canada",
        "ir": "https://www.eldoradogold.com/investors",
        "logo": "eldoradogold.com"
    },
    "YRI.TO": {
        "name": "Yamana Gold",
        "yfinance": "YRI.TO",
        "region": "canada",
        "ir": "https://www.yamana.com/investors",
        "logo": "yamana.com"
    },
    "FNV.TO": {
        "name": "Franco-Nevada",
        "yfinance": "FNV.TO",
        "region": "canada",
        "ir": "https://www.franco-nevada.com/investors",
        "logo": "franco-nevada.com"
    },
    "WPM.TO": {
        "name": "Wheaton Precious Metals",
        "yfinance": "WPM.TO",
        "region": "canada",
        "ir": "https://www.wheatonpm.com/investors",
        "logo": "wheatonpm.com"
    },
    "SSL.TO": {
        "name": "Sandstorm Gold",
        "yfinance": "SSL.TO",
        "region": "canada",
        "ir": "https://www.sandstormgold.com/investors",
        "logo": "sandstormgold.com"
    },
    "OR.TO": {
        "name": "Osisko Gold Royalties",
        "yfinance": "OR.TO",
        "region": "canada",
        "ir": "https://osiskogr.com/en/investors",
        "logo": "osiskogr.com"
    },
    # Mining - Diversified
    "TECK-B.TO": {
        "name": "Teck Resources",
        "yfinance": "TECK-B.TO",
        "region": "canada",
        "ir": "https://www.teck.com/investors",
        "logo": "teck.com"
    },
    "FM.TO": {
        "name": "First Quantum Minerals",
        "yfinance": "FM.TO",
        "region": "canada",
        "ir": "https://www.first-quantum.com/Our-Company/Investors",
        "logo": "first-quantum.com"
    },
    "IVN.TO": {
        "name": "Ivanhoe Mines",
        "yfinance": "IVN.TO",
        "region": "canada",
        "ir": "https://www.ivanhoemines.com/investors",
        "logo": "ivanhoemines.com"
    },
    "LUN.TO": {
        "name": "Lundin Mining",
        "yfinance": "LUN.TO",
        "region": "canada",
        "ir": "https://www.lundinmining.com/investors",
        "logo": "lundinmining.com"
    },
    "CS.TO": {
        "name": "Capstone Copper",
        "yfinance": "CS.TO",
        "region": "canada",
        "ir": "https://capstonecopper.com/investors",
        "logo": "capstonecopper.com"
    },
    "HBM.TO": {
        "name": "Hudbay Minerals",
        "yfinance": "HBM.TO",
        "region": "canada",
        "ir": "https://www.hudbayminerals.com/investors",
        "logo": "hudbayminerals.com"
    },
    # Mining - Silver
    "PAAS.TO": {
        "name": "Pan American Silver",
        "yfinance": "PAAS.TO",
        "region": "canada",
        "ir": "https://www.panamericansilver.com/investors",
        "logo": "panamericansilver.com"
    },
    "FR.TO": {
        "name": "First Majestic Silver",
        "yfinance": "FR.TO",
        "region": "canada",
        "ir": "https://www.firstmajestic.com/investors",
        "logo": "firstmajestic.com"
    },
    "MAG.TO": {
        "name": "MAG Silver",
        "yfinance": "MAG.TO",
        "region": "canada",
        "ir": "https://magsilver.com/investors",
        "logo": "magsilver.com"
    },
    # Mining - Lithium & Battery Metals
    "LAC.TO": {
        "name": "Lithium Americas",
        "yfinance": "LAC.TO",
        "region": "canada",
        "ir": "https://www.lithiumamericas.com/investors",
        "logo": "lithiumamericas.com"
    },
    "LI.TO": {
        "name": "Li-Cycle Holdings",
        "yfinance": "LI.TO",
        "region": "canada",
        "ir": "https://li-cycle.com/investors",
        "logo": "li-cycle.com"
    },
    # Mining - Uranium
    "CCO.TO": {
        "name": "Cameco",
        "yfinance": "CCO.TO",
        "region": "canada",
        "ir": "https://www.cameco.com/invest",
        "logo": "cameco.com"
    },
    "NXE.TO": {
        "name": "NexGen Energy",
        "yfinance": "NXE.TO",
        "region": "canada",
        "ir": "https://www.nexgenenergy.ca/investors",
        "logo": "nexgenenergy.ca"
    },
    "DML.TO": {
        "name": "Denison Mines",
        "yfinance": "DML.TO",
        "region": "canada",
        "ir": "https://www.denisonmines.com/investors",
        "logo": "denisonmines.com"
    },
    # Telecom & Tech
    "BCE.TO": {
        "name": "BCE Inc",
        "yfinance": "BCE.TO",
        "region": "canada",
        "ir": "https://www.bce.ca/investors",
        "logo": "bce.ca"
    },
    "T.TO": {
        "name": "TELUS",
        "yfinance": "T.TO",
        "region": "canada",
        "ir": "https://www.telus.com/en/about/investor-relations",
        "logo": "telus.com"
    },
    "RCI-B.TO": {
        "name": "Rogers Communications",
        "yfinance": "RCI-B.TO",
        "region": "canada",
        "ir": "https://about.rogers.com/investors",
        "logo": "rogers.com"
    },
    "SHOP.TO": {
        "name": "Shopify",
        "yfinance": "SHOP.TO",
        "region": "canada",
        "ir": "https://investors.shopify.com",
        "logo": "shopify.com"
    },
    "CSU.TO": {
        "name": "Constellation Software",
        "yfinance": "CSU.TO",
        "region": "canada",
        "ir": "https://www.csisoftware.com/investor-relations",
        "logo": "csisoftware.com"
    },
    "OTEX.TO": {
        "name": "OpenText",
        "yfinance": "OTEX.TO",
        "region": "canada",
        "ir": "https://investors.opentext.com",
        "logo": "opentext.com"
    },
    "BB.TO": {
        "name": "BlackBerry",
        "yfinance": "BB.TO",
        "region": "canada",
        "ir": "https://www.blackberry.com/us/en/company/investors",
        "logo": "blackberry.com"
    },
    # Rail
    "CNR.TO": {
        "name": "Canadian National Railway",
        "yfinance": "CNR.TO",
        "region": "canada",
        "ir": "https://www.cn.ca/en/investors",
        "logo": "cn.ca"
    },
    "CP.TO": {
        "name": "Canadian Pacific Kansas City",
        "yfinance": "CP.TO",
        "region": "canada",
        "ir": "https://investor.cpkcr.com",
        "logo": "cpkcr.com"
    },
    # Retail
    "L.TO": {
        "name": "Loblaw Companies",
        "yfinance": "L.TO",
        "region": "canada",
        "ir": "https://www.loblaw.ca/en/investors-landing",
        "logo": "loblaw.ca"
    },
    "ATD.TO": {
        "name": "Alimentation Couche-Tard",
        "yfinance": "ATD.TO",
        "region": "canada",
        "ir": "https://corpo.couche-tard.com/en/investors",
        "logo": "couche-tard.com"
    },
    "DOL.TO": {
        "name": "Dollarama",
        "yfinance": "DOL.TO",
        "region": "canada",
        "ir": "https://www.dollarama.com/en-CA/corp/investors",
        "logo": "dollarama.com"
    },
    "WN.TO": {
        "name": "George Weston",
        "yfinance": "WN.TO",
        "region": "canada",
        "ir": "https://www.weston.ca/en/Our-Business/Weston-Group/Investor-Relations",
        "logo": "weston.ca"
    },
    "MRU.TO": {
        "name": "Metro Inc",
        "yfinance": "MRU.TO",
        "region": "canada",
        "ir": "https://corpo.metro.ca/en/investor-relations.html",
        "logo": "metro.ca"
    },
    "NWC.TO": {
        "name": "North West Company",
        "yfinance": "NWC.TO",
        "region": "canada",
        "ir": "https://www.northwest.ca/investors",
        "logo": "northwest.ca"
    },
    # Insurance
    "MFC.TO": {
        "name": "Manulife Financial",
        "yfinance": "MFC.TO",
        "region": "canada",
        "ir": "https://www.manulife.com/en/investors.html",
        "logo": "manulife.com"
    },
    "SLF.TO": {
        "name": "Sun Life Financial",
        "yfinance": "SLF.TO",
        "region": "canada",
        "ir": "https://www.sunlife.com/en/investors",
        "logo": "sunlife.com"
    },
    "GWO.TO": {
        "name": "Great-West Lifeco",
        "yfinance": "GWO.TO",
        "region": "canada",
        "ir": "https://www.greatwestlifeco.com/investors.html",
        "logo": "greatwestlifeco.com"
    },
    "IFC.TO": {
        "name": "Intact Financial",
        "yfinance": "IFC.TO",
        "region": "canada",
        "ir": "https://www.intactfc.com/English/investors",
        "logo": "intactfc.com"
    },
    "FFH.TO": {
        "name": "Fairfax Financial Holdings",
        "yfinance": "FFH.TO",
        "region": "canada",
        "ir": "https://www.fairfax.ca/investors",
        "logo": "fairfax.ca"
    },
    # Real Estate
    "BPY-UN.TO": {
        "name": "Brookfield Property Partners",
        "yfinance": "BPY-UN.TO",
        "region": "canada",
        "ir": "https://bpy.brookfield.com/investors",
        "logo": "brookfield.com"
    },
    "REI-UN.TO": {
        "name": "RioCan REIT",
        "yfinance": "REI-UN.TO",
        "region": "canada",
        "ir": "https://www.riocan.com/investors",
        "logo": "riocan.com"
    },
    "CAR-UN.TO": {
        "name": "Canadian Apartment Properties REIT",
        "yfinance": "CAR-UN.TO",
        "region": "canada",
        "ir": "https://www.capreit.ca/investors",
        "logo": "capreit.ca"
    },
    # Utilities
    "FTS.TO": {
        "name": "Fortis",
        "yfinance": "FTS.TO",
        "region": "canada",
        "ir": "https://www.fortisinc.com/investors",
        "logo": "fortisinc.com"
    },
    "EMA.TO": {
        "name": "Emera",
        "yfinance": "EMA.TO",
        "region": "canada",
        "ir": "https://www.emera.com/investors",
        "logo": "emera.com"
    },
    "H.TO": {
        "name": "Hydro One",
        "yfinance": "H.TO",
        "region": "canada",
        "ir": "https://www.hydroone.com/about/corporate-information/investor-relations",
        "logo": "hydroone.com"
    },
    "CU.TO": {
        "name": "Canadian Utilities",
        "yfinance": "CU.TO",
        "region": "canada",
        "ir": "https://www.canadianutilities.com/en/investor-centre.html",
        "logo": "canadianutilities.com"
    },
    # Industrial
    "CAE.TO": {
        "name": "CAE Inc",
        "yfinance": "CAE.TO",
        "region": "canada",
        "ir": "https://www.cae.com/investors",
        "logo": "cae.com"
    },
    "WSP.TO": {
        "name": "WSP Global",
        "yfinance": "WSP.TO",
        "region": "canada",
        "ir": "https://www.wsp.com/en-GL/investors",
        "logo": "wsp.com"
    },
    "STN.TO": {
        "name": "Stantec",
        "yfinance": "STN.TO",
        "region": "canada",
        "ir": "https://www.stantec.com/en/about-us/investors",
        "logo": "stantec.com"
    },
    "TIH.TO": {
        "name": "Toromont Industries",
        "yfinance": "TIH.TO",
        "region": "canada",
        "ir": "https://www.toromont.com/investor-relations",
        "logo": "toromont.com"
    },
    "WCN.TO": {
        "name": "Waste Connections",
        "yfinance": "WCN.TO",
        "region": "canada",
        "ir": "https://investors.wasteconnections.com",
        "logo": "wasteconnections.com"
    },
    "GFL.TO": {
        "name": "GFL Environmental",
        "yfinance": "GFL.TO",
        "region": "canada",
        "ir": "https://investors.gflenv.com",
        "logo": "gflenv.com"
    },
    # Cannabis
    "WEED.TO": {
        "name": "Canopy Growth",
        "yfinance": "WEED.TO",
        "region": "canada",
        "ir": "https://www.canopygrowth.com/investors",
        "logo": "canopygrowth.com"
    },
    "TLRY.TO": {
        "name": "Tilray Brands",
        "yfinance": "TLRY.TO",
        "region": "canada",
        "ir": "https://ir.tilray.com",
        "logo": "tilray.com"
    },
    # Aerospace
    "BBD-B.TO": {
        "name": "Bombardier",
        "yfinance": "BBD-B.TO",
        "region": "canada",
        "ir": "https://bombardier.com/en/investors",
        "logo": "bombardier.com"
    },
    # Food & Beverage
    "SAP.TO": {
        "name": "Saputo",
        "yfinance": "SAP.TO",
        "region": "canada",
        "ir": "https://www.saputo.com/en/investors",
        "logo": "saputo.com"
    },
    "ATZ.TO": {
        "name": "Aritzia",
        "yfinance": "ATZ.TO",
        "region": "canada",
        "ir": "https://investors.aritzia.com",
        "logo": "aritzia.com"
    },
    "PBH.TO": {
        "name": "Premium Brands Holdings",
        "yfinance": "PBH.TO",
        "region": "canada",
        "ir": "https://www.premiumbrandsholdings.com/investors.html",
        "logo": "premiumbrandsholdings.com"
    },
}

# ============================================================================
# AUSTRALIAN STOCK EXCHANGE (.AX)
# ============================================================================

AUSTRALIAN_STOCKS = {
    # Mining - Diversified
    "BHP.AX": {
        "name": "BHP Group",
        "yfinance": "BHP.AX",
        "region": "australia",
        "ir": "https://www.bhp.com/investors",
        "logo": "bhp.com"
    },
    "RIO.AX": {
        "name": "Rio Tinto",
        "yfinance": "RIO.AX",
        "region": "australia",
        "ir": "https://www.riotinto.com/investors",
        "logo": "riotinto.com"
    },
    "FMG.AX": {
        "name": "Fortescue",
        "yfinance": "FMG.AX",
        "region": "australia",
        "ir": "https://www.fortescue.com/investors",
        "logo": "fortescue.com"
    },
    "S32.AX": {
        "name": "South32",
        "yfinance": "S32.AX",
        "region": "australia",
        "ir": "https://www.south32.net/investors-media",
        "logo": "south32.net"
    },
    "MIN.AX": {
        "name": "Mineral Resources",
        "yfinance": "MIN.AX",
        "region": "australia",
        "ir": "https://www.mineralresources.com.au/investors",
        "logo": "mineralresources.com.au"
    },
    "IGO.AX": {
        "name": "IGO Limited",
        "yfinance": "IGO.AX",
        "region": "australia",
        "ir": "https://www.igo.com.au/investors",
        "logo": "igo.com.au"
    },
    # Mining - Gold
    "NCM.AX": {
        "name": "Newcrest Mining",
        "yfinance": "NCM.AX",
        "region": "australia",
        "ir": "https://www.newcrest.com/investors",
        "logo": "newcrest.com"
    },
    "NST.AX": {
        "name": "Northern Star Resources",
        "yfinance": "NST.AX",
        "region": "australia",
        "ir": "https://www.nsrltd.com/investors",
        "logo": "nsrltd.com"
    },
    "EVN.AX": {
        "name": "Evolution Mining",
        "yfinance": "EVN.AX",
        "region": "australia",
        "ir": "https://evolutionmining.com.au/investors",
        "logo": "evolutionmining.com.au"
    },
    "RRL.AX": {
        "name": "Regis Resources",
        "yfinance": "RRL.AX",
        "region": "australia",
        "ir": "https://www.regisresources.com.au/investors",
        "logo": "regisresources.com.au"
    },
    "GOR.AX": {
        "name": "Gold Road Resources",
        "yfinance": "GOR.AX",
        "region": "australia",
        "ir": "https://www.goldroad.com.au/investors",
        "logo": "goldroad.com.au"
    },
    "SBM.AX": {
        "name": "St Barbara",
        "yfinance": "SBM.AX",
        "region": "australia",
        "ir": "https://stbarbara.com.au/investors",
        "logo": "stbarbara.com.au"
    },
    "RSG.AX": {
        "name": "Resolute Mining",
        "yfinance": "RSG.AX",
        "region": "australia",
        "ir": "https://www.rml.com.au/investors",
        "logo": "rml.com.au"
    },
    "PRU.AX": {
        "name": "Perseus Mining",
        "yfinance": "PRU.AX",
        "region": "australia",
        "ir": "https://perseusmining.com/investors",
        "logo": "perseusmining.com"
    },
    "SAR.AX": {
        "name": "Saracen Mineral Holdings",
        "yfinance": "SAR.AX",
        "region": "australia",
        "ir": "https://www.saracen.com.au/investors",
        "logo": "saracen.com.au"
    },
    "DCN.AX": {
        "name": "Dacian Gold",
        "yfinance": "DCN.AX",
        "region": "australia",
        "ir": "https://www.daciangold.com.au/investors",
        "logo": "daciangold.com.au"
    },
    # Mining - Lithium
    "PLS.AX": {
        "name": "Pilbara Minerals",
        "yfinance": "PLS.AX",
        "region": "australia",
        "ir": "https://pilbaraminerals.com.au/investors",
        "logo": "pilbaraminerals.com.au"
    },
    "AKE.AX": {
        "name": "Allkem",
        "yfinance": "AKE.AX",
        "region": "australia",
        "ir": "https://www.allkem.co/investors",
        "logo": "allkem.co"
    },
    "LTR.AX": {
        "name": "Liontown Resources",
        "yfinance": "LTR.AX",
        "region": "australia",
        "ir": "https://www.ltresources.com.au/investors",
        "logo": "ltresources.com.au"
    },
    "CXO.AX": {
        "name": "Core Lithium",
        "yfinance": "CXO.AX",
        "region": "australia",
        "ir": "https://www.corelithium.com.au/investors",
        "logo": "corelithium.com.au"
    },
    "SYA.AX": {
        "name": "Sayona Mining",
        "yfinance": "SYA.AX",
        "region": "australia",
        "ir": "https://www.sayonamining.com.au/investors",
        "logo": "sayonamining.com.au"
    },
    "LKE.AX": {
        "name": "Lake Resources",
        "yfinance": "LKE.AX",
        "region": "australia",
        "ir": "https://www.lakeresources.com.au/investors",
        "logo": "lakeresources.com.au"
    },
    # Mining - Rare Earths
    "LYC.AX": {
        "name": "Lynas Rare Earths",
        "yfinance": "LYC.AX",
        "region": "australia",
        "ir": "https://lynasrareearths.com/investors",
        "logo": "lynasrareearths.com"
    },
    "ILU.AX": {
        "name": "Iluka Resources",
        "yfinance": "ILU.AX",
        "region": "australia",
        "ir": "https://www.iluka.com/investors-media",
        "logo": "iluka.com"
    },
    # Mining - Copper
    "OZL.AX": {
        "name": "OZ Minerals",
        "yfinance": "OZL.AX",
        "region": "australia",
        "ir": "https://www.ozminerals.com/investors",
        "logo": "ozminerals.com"
    },
    "SFR.AX": {
        "name": "Sandfire Resources",
        "yfinance": "SFR.AX",
        "region": "australia",
        "ir": "https://www.sandfire.com.au/investors",
        "logo": "sandfire.com.au"
    },
    "29M.AX": {
        "name": "29Metals",
        "yfinance": "29M.AX",
        "region": "australia",
        "ir": "https://www.29metals.com/investors",
        "logo": "29metals.com"
    },
    # Mining - Nickel
    "NIC.AX": {
        "name": "Nickel Industries",
        "yfinance": "NIC.AX",
        "region": "australia",
        "ir": "https://nickelindustries.com/investors",
        "logo": "nickelindustries.com"
    },
    "WSA.AX": {
        "name": "Western Areas",
        "yfinance": "WSA.AX",
        "region": "australia",
        "ir": "https://www.westernareas.com.au/investors",
        "logo": "westernareas.com.au"
    },
    "PAN.AX": {
        "name": "Panoramic Resources",
        "yfinance": "PAN.AX",
        "region": "australia",
        "ir": "https://www.panoramicresources.com/investors",
        "logo": "panoramicresources.com"
    },
    # Mining - Coal
    "WHC.AX": {
        "name": "Whitehaven Coal",
        "yfinance": "WHC.AX",
        "region": "australia",
        "ir": "https://www.whitehavencoal.com.au/investors",
        "logo": "whitehavencoal.com.au"
    },
    "NHC.AX": {
        "name": "New Hope Corporation",
        "yfinance": "NHC.AX",
        "region": "australia",
        "ir": "https://www.newhopegroup.com.au/investors",
        "logo": "newhopegroup.com.au"
    },
    "YAL.AX": {
        "name": "Yancoal Australia",
        "yfinance": "YAL.AX",
        "region": "australia",
        "ir": "https://www.yancoal.com.au/page/investors",
        "logo": "yancoal.com.au"
    },
    "SMR.AX": {
        "name": "Stanmore Resources",
        "yfinance": "SMR.AX",
        "region": "australia",
        "ir": "https://www.stanmore.net.au/investors",
        "logo": "stanmore.net.au"
    },
    # Mining - Uranium
    "PDN.AX": {
        "name": "Paladin Energy",
        "yfinance": "PDN.AX",
        "region": "australia",
        "ir": "https://www.paladinenergy.com.au/investors",
        "logo": "paladinenergy.com.au"
    },
    "BOE.AX": {
        "name": "Boss Energy",
        "yfinance": "BOE.AX",
        "region": "australia",
        "ir": "https://www.bossenergy.com/investors",
        "logo": "bossenergy.com"
    },
    "DYL.AX": {
        "name": "Deep Yellow",
        "yfinance": "DYL.AX",
        "region": "australia",
        "ir": "https://www.deepyellow.com.au/investors",
        "logo": "deepyellow.com.au"
    },
    # Banks
    "CBA.AX": {
        "name": "Commonwealth Bank of Australia",
        "yfinance": "CBA.AX",
        "region": "australia",
        "ir": "https://www.commbank.com.au/about-us/investors.html",
        "logo": "commbank.com.au"
    },
    "WBC.AX": {
        "name": "Westpac Banking",
        "yfinance": "WBC.AX",
        "region": "australia",
        "ir": "https://www.westpac.com.au/about-westpac/investor-centre",
        "logo": "westpac.com.au"
    },
    "NAB.AX": {
        "name": "National Australia Bank",
        "yfinance": "NAB.AX",
        "region": "australia",
        "ir": "https://www.nab.com.au/about-us/shareholder-centre",
        "logo": "nab.com.au"
    },
    "ANZ.AX": {
        "name": "ANZ Group",
        "yfinance": "ANZ.AX",
        "region": "australia",
        "ir": "https://www.anz.com/shareholder/centre",
        "logo": "anz.com"
    },
    "MQG.AX": {
        "name": "Macquarie Group",
        "yfinance": "MQG.AX",
        "region": "australia",
        "ir": "https://www.macquarie.com/us/en/investors.html",
        "logo": "macquarie.com"
    },
    # Oil & Gas
    "WDS.AX": {
        "name": "Woodside Energy",
        "yfinance": "WDS.AX",
        "region": "australia",
        "ir": "https://www.woodside.com/investors",
        "logo": "woodside.com"
    },
    "STO.AX": {
        "name": "Santos",
        "yfinance": "STO.AX",
        "region": "australia",
        "ir": "https://www.santos.com/investors",
        "logo": "santos.com"
    },
    "ORG.AX": {
        "name": "Origin Energy",
        "yfinance": "ORG.AX",
        "region": "australia",
        "ir": "https://www.originenergy.com.au/investors",
        "logo": "originenergy.com.au"
    },
    "BPT.AX": {
        "name": "Beach Energy",
        "yfinance": "BPT.AX",
        "region": "australia",
        "ir": "https://www.beachenergy.com.au/investors",
        "logo": "beachenergy.com.au"
    },
    "KAR.AX": {
        "name": "Karoon Energy",
        "yfinance": "KAR.AX",
        "region": "australia",
        "ir": "https://www.karoonenergy.com.au/investors",
        "logo": "karoonenergy.com.au"
    },
    # Insurance
    "QBE.AX": {
        "name": "QBE Insurance Group",
        "yfinance": "QBE.AX",
        "region": "australia",
        "ir": "https://www.qbe.com/investor-relations",
        "logo": "qbe.com"
    },
    "IAG.AX": {
        "name": "Insurance Australia Group",
        "yfinance": "IAG.AX",
        "region": "australia",
        "ir": "https://www.iag.com.au/investor-relations",
        "logo": "iag.com.au"
    },
    "SUN.AX": {
        "name": "Suncorp Group",
        "yfinance": "SUN.AX",
        "region": "australia",
        "ir": "https://www.suncorpgroup.com.au/investors",
        "logo": "suncorpgroup.com.au"
    },
    # Retail
    "WOW.AX": {
        "name": "Woolworths Group",
        "yfinance": "WOW.AX",
        "region": "australia",
        "ir": "https://www.woolworthsgroup.com.au/page/investors",
        "logo": "woolworthsgroup.com.au"
    },
    "COL.AX": {
        "name": "Coles Group",
        "yfinance": "COL.AX",
        "region": "australia",
        "ir": "https://www.colesgroup.com.au/investors",
        "logo": "colesgroup.com.au"
    },
    "WES.AX": {
        "name": "Wesfarmers",
        "yfinance": "WES.AX",
        "region": "australia",
        "ir": "https://www.wesfarmers.com.au/investor-centre",
        "logo": "wesfarmers.com.au"
    },
    "JBH.AX": {
        "name": "JB Hi-Fi",
        "yfinance": "JBH.AX",
        "region": "australia",
        "ir": "https://www.jbhifi.com.au/pages/investors",
        "logo": "jbhifi.com.au"
    },
    "HVN.AX": {
        "name": "Harvey Norman Holdings",
        "yfinance": "HVN.AX",
        "region": "australia",
        "ir": "https://www.harveynormanholdings.com.au/investors.htm",
        "logo": "harveynorman.com.au"
    },
    # Healthcare
    "CSL.AX": {
        "name": "CSL Limited",
        "yfinance": "CSL.AX",
        "region": "australia",
        "ir": "https://www.csl.com/investors",
        "logo": "csl.com"
    },
    "COH.AX": {
        "name": "Cochlear",
        "yfinance": "COH.AX",
        "region": "australia",
        "ir": "https://www.cochlear.com/us/en/corporate/investors",
        "logo": "cochlear.com"
    },
    "RMD.AX": {
        "name": "ResMed",
        "yfinance": "RMD.AX",
        "region": "australia",
        "ir": "https://investor.resmed.com",
        "logo": "resmed.com"
    },
    "SHL.AX": {
        "name": "Sonic Healthcare",
        "yfinance": "SHL.AX",
        "region": "australia",
        "ir": "https://investors.sonichealthcare.com",
        "logo": "sonichealthcare.com"
    },
    "RHC.AX": {
        "name": "Ramsay Health Care",
        "yfinance": "RHC.AX",
        "region": "australia",
        "ir": "https://www.ramsayhealth.com/investors",
        "logo": "ramsayhealth.com"
    },
    "PME.AX": {
        "name": "Pro Medicus",
        "yfinance": "PME.AX",
        "region": "australia",
        "ir": "https://www.promed.com.au/investors",
        "logo": "promed.com.au"
    },
    # Tech
    "XRO.AX": {
        "name": "Xero",
        "yfinance": "XRO.AX",
        "region": "australia",
        "ir": "https://www.xero.com/au/about/investors",
        "logo": "xero.com"
    },
    "WTC.AX": {
        "name": "WiseTech Global",
        "yfinance": "WTC.AX",
        "region": "australia",
        "ir": "https://www.wisetechglobal.com/investors",
        "logo": "wisetechglobal.com"
    },
    "CPU.AX": {
        "name": "Computershare",
        "yfinance": "CPU.AX",
        "region": "australia",
        "ir": "https://www.computershare.com/corporate/investor-relations",
        "logo": "computershare.com"
    },
    "ALU.AX": {
        "name": "Altium",
        "yfinance": "ALU.AX",
        "region": "australia",
        "ir": "https://www.altium.com/company/investors",
        "logo": "altium.com"
    },
    "APX.AX": {
        "name": "Appen",
        "yfinance": "APX.AX",
        "region": "australia",
        "ir": "https://appen.com/company/investors",
        "logo": "appen.com"
    },
    "TNE.AX": {
        "name": "TechnologyOne",
        "yfinance": "TNE.AX",
        "region": "australia",
        "ir": "https://www.technologyonecorp.com/investors",
        "logo": "technologyonecorp.com"
    },
    "MP1.AX": {
        "name": "Megaport",
        "yfinance": "MP1.AX",
        "region": "australia",
        "ir": "https://www.megaport.com/investors",
        "logo": "megaport.com"
    },
    # Telecom
    "TLS.AX": {
        "name": "Telstra",
        "yfinance": "TLS.AX",
        "region": "australia",
        "ir": "https://www.telstra.com.au/aboutus/investors",
        "logo": "telstra.com.au"
    },
    "TPG.AX": {
        "name": "TPG Telecom",
        "yfinance": "TPG.AX",
        "region": "australia",
        "ir": "https://www.tpgtelecom.com.au/investor-centre",
        "logo": "tpgtelecom.com.au"
    },
    # Infrastructure
    "TCL.AX": {
        "name": "Transurban Group",
        "yfinance": "TCL.AX",
        "region": "australia",
        "ir": "https://www.transurban.com/investor-centre",
        "logo": "transurban.com"
    },
    "APA.AX": {
        "name": "APA Group",
        "yfinance": "APA.AX",
        "region": "australia",
        "ir": "https://www.apa.com.au/investor-centre",
        "logo": "apa.com.au"
    },
    "AZJ.AX": {
        "name": "Aurizon Holdings",
        "yfinance": "AZJ.AX",
        "region": "australia",
        "ir": "https://www.aurizon.com.au/investors",
        "logo": "aurizon.com.au"
    },
    "QAN.AX": {
        "name": "Qantas Airways",
        "yfinance": "QAN.AX",
        "region": "australia",
        "ir": "https://investor.qantas.com",
        "logo": "qantas.com"
    },
    "SYD.AX": {
        "name": "Sydney Airport",
        "yfinance": "SYD.AX",
        "region": "australia",
        "ir": "https://www.sydneyairport.com.au/investor",
        "logo": "sydneyairport.com.au"
    },
    # REITs
    "GMG.AX": {
        "name": "Goodman Group",
        "yfinance": "GMG.AX",
        "region": "australia",
        "ir": "https://www.goodman.com/investor-centre",
        "logo": "goodman.com"
    },
    "GPT.AX": {
        "name": "GPT Group",
        "yfinance": "GPT.AX",
        "region": "australia",
        "ir": "https://www.gpt.com.au/investor-centre",
        "logo": "gpt.com.au"
    },
    "DXS.AX": {
        "name": "Dexus",
        "yfinance": "DXS.AX",
        "region": "australia",
        "ir": "https://www.dexus.com/investor-centre",
        "logo": "dexus.com"
    },
    "MGR.AX": {
        "name": "Mirvac Group",
        "yfinance": "MGR.AX",
        "region": "australia",
        "ir": "https://www.mirvac.com/investor-centre",
        "logo": "mirvac.com"
    },
    "SCG.AX": {
        "name": "Scentre Group",
        "yfinance": "SCG.AX",
        "region": "australia",
        "ir": "https://www.scentregroup.com/investors",
        "logo": "scentregroup.com"
    },
    "VCX.AX": {
        "name": "Vicinity Centres",
        "yfinance": "VCX.AX",
        "region": "australia",
        "ir": "https://www.vicinity.com.au/investors",
        "logo": "vicinity.com.au"
    },
    # Other
    "BXB.AX": {
        "name": "Brambles",
        "yfinance": "BXB.AX",
        "region": "australia",
        "ir": "https://www.brambles.com/investors",
        "logo": "brambles.com"
    },
    "AMC.AX": {
        "name": "Amcor",
        "yfinance": "AMC.AX",
        "region": "australia",
        "ir": "https://www.amcor.com/investors",
        "logo": "amcor.com"
    },
    "ORI.AX": {
        "name": "Orica",
        "yfinance": "ORI.AX",
        "region": "australia",
        "ir": "https://www.orica.com/Investors",
        "logo": "orica.com"
    },
    "JHX.AX": {
        "name": "James Hardie Industries",
        "yfinance": "JHX.AX",
        "region": "australia",
        "ir": "https://www.jameshardie.com/investors",
        "logo": "jameshardie.com"
    },
    "REA.AX": {
        "name": "REA Group",
        "yfinance": "REA.AX",
        "region": "australia",
        "ir": "https://www.rea-group.com/investors",
        "logo": "rea-group.com"
    },
    "SEK.AX": {
        "name": "Seek",
        "yfinance": "SEK.AX",
        "region": "australia",
        "ir": "https://www.seek.com.au/about/investors",
        "logo": "seek.com.au"
    },
    "CAR.AX": {
        "name": "Carsales.com",
        "yfinance": "CAR.AX",
        "region": "australia",
        "ir": "https://shareholders.carsales.com.au",
        "logo": "carsales.com.au"
    },
    "ALL.AX": {
        "name": "Aristocrat Leisure",
        "yfinance": "ALL.AX",
        "region": "australia",
        "ir": "https://www.aristocrat.com/investors",
        "logo": "aristocrat.com"
    },
    "TWE.AX": {
        "name": "Treasury Wine Estates",
        "yfinance": "TWE.AX",
        "region": "australia",
        "ir": "https://www.tweglobal.com/investors",
        "logo": "tweglobal.com"
    },
    "A2M.AX": {
        "name": "The a2 Milk Company",
        "yfinance": "A2M.AX",
        "region": "australia",
        "ir": "https://thea2milkcompany.com/investors",
        "logo": "thea2milkcompany.com"
    },
}

# ============================================================================
# HONG KONG STOCK EXCHANGE (.HK)
# ============================================================================

HONG_KONG_STOCKS = {
    # Banks & Finance
    "0005.HK": {
        "name": "HSBC Holdings",
        "yfinance": "0005.HK",
        "region": "hongkong",
        "ir": "https://www.hsbc.com/investors",
        "logo": "hsbc.com"
    },
    "2388.HK": {
        "name": "BOC Hong Kong",
        "yfinance": "2388.HK",
        "region": "hongkong",
        "ir": "https://www.bochk.com/en/aboutus/investorrelations.html",
        "logo": "bochk.com"
    },
    "0011.HK": {
        "name": "Hang Seng Bank",
        "yfinance": "0011.HK",
        "region": "hongkong",
        "ir": "https://www.hangseng.com/en-hk/about-us/investor-relations",
        "logo": "hangseng.com"
    },
    "0388.HK": {
        "name": "Hong Kong Exchanges and Clearing",
        "yfinance": "0388.HK",
        "region": "hongkong",
        "ir": "https://www.hkexgroup.com/Investor-Relations",
        "logo": "hkexgroup.com"
    },
    "2318.HK": {
        "name": "Ping An Insurance",
        "yfinance": "2318.HK",
        "region": "hongkong",
        "ir": "https://group.pingan.com/investor_relations.html",
        "logo": "pingan.com"
    },
    "1299.HK": {
        "name": "AIA Group",
        "yfinance": "1299.HK",
        "region": "hongkong",
        "ir": "https://www.aia.com/en/investor-relations",
        "logo": "aia.com"
    },
    # Tech
    "0700.HK": {
        "name": "Tencent Holdings",
        "yfinance": "0700.HK",
        "region": "hongkong",
        "ir": "https://www.tencent.com/en-us/investors.html",
        "logo": "tencent.com"
    },
    "9988.HK": {
        "name": "Alibaba Group",
        "yfinance": "9988.HK",
        "region": "hongkong",
        "ir": "https://www.alibabagroup.com/en-US/ir",
        "logo": "alibabagroup.com"
    },
    "9618.HK": {
        "name": "JD.com",
        "yfinance": "9618.HK",
        "region": "hongkong",
        "ir": "https://ir.jd.com",
        "logo": "jd.com"
    },
    "3690.HK": {
        "name": "Meituan",
        "yfinance": "3690.HK",
        "region": "hongkong",
        "ir": "https://about.meituan.com/en/investor",
        "logo": "meituan.com"
    },
    "9888.HK": {
        "name": "Baidu",
        "yfinance": "9888.HK",
        "region": "hongkong",
        "ir": "https://ir.baidu.com",
        "logo": "baidu.com"
    },
    "0981.HK": {
        "name": "Semiconductor Manufacturing International",
        "yfinance": "0981.HK",
        "region": "hongkong",
        "ir": "https://www.smics.com/en/site/investor",
        "logo": "smics.com"
    },
    "9999.HK": {
        "name": "NetEase",
        "yfinance": "9999.HK",
        "region": "hongkong",
        "ir": "https://ir.netease.com",
        "logo": "netease.com"
    },
    "1810.HK": {
        "name": "Xiaomi Corporation",
        "yfinance": "1810.HK",
        "region": "hongkong",
        "ir": "https://ir.mi.com",
        "logo": "mi.com"
    },
    "9868.HK": {
        "name": "XPeng",
        "yfinance": "9868.HK",
        "region": "hongkong",
        "ir": "https://ir.xiaopeng.com",
        "logo": "xiaopeng.com"
    },
    "9866.HK": {
        "name": "NIO",
        "yfinance": "9866.HK",
        "region": "hongkong",
        "ir": "https://ir.nio.com",
        "logo": "nio.com"
    },
    "2015.HK": {
        "name": "Li Auto",
        "yfinance": "2015.HK",
        "region": "hongkong",
        "ir": "https://ir.lixiang.com",
        "logo": "lixiang.com"
    },
    "1024.HK": {
        "name": "Kuaishou Technology",
        "yfinance": "1024.HK",
        "region": "hongkong",
        "ir": "https://ir.kuaishou.com",
        "logo": "kuaishou.com"
    },
    "9626.HK": {
        "name": "Bilibili",
        "yfinance": "9626.HK",
        "region": "hongkong",
        "ir": "https://ir.bilibili.com",
        "logo": "bilibili.com"
    },
    # Real Estate
    "0016.HK": {
        "name": "Sun Hung Kai Properties",
        "yfinance": "0016.HK",
        "region": "hongkong",
        "ir": "https://www.shkp.com/en-us/investor-relations",
        "logo": "shkp.com"
    },
    "0001.HK": {
        "name": "CK Hutchison Holdings",
        "yfinance": "0001.HK",
        "region": "hongkong",
        "ir": "https://www.ckh.com.hk/en/investors",
        "logo": "ckh.com.hk"
    },
    "0012.HK": {
        "name": "Henderson Land Development",
        "yfinance": "0012.HK",
        "region": "hongkong",
        "ir": "https://www.hld.com/en/investor-relations",
        "logo": "hld.com"
    },
    "0017.HK": {
        "name": "New World Development",
        "yfinance": "0017.HK",
        "region": "hongkong",
        "ir": "https://www.nwd.com.hk/en/investor-relations",
        "logo": "nwd.com.hk"
    },
    "0002.HK": {
        "name": "CLP Holdings",
        "yfinance": "0002.HK",
        "region": "hongkong",
        "ir": "https://www.clpgroup.com/en/investors-information",
        "logo": "clpgroup.com"
    },
    "0003.HK": {
        "name": "Hong Kong and China Gas",
        "yfinance": "0003.HK",
        "region": "hongkong",
        "ir": "https://www.towngas.com/en/Investor-Relations",
        "logo": "towngas.com"
    },
    "0006.HK": {
        "name": "Power Assets Holdings",
        "yfinance": "0006.HK",
        "region": "hongkong",
        "ir": "https://www.powerassets.com/en/investor-relations",
        "logo": "powerassets.com"
    },
    "0083.HK": {
        "name": "Sino Land",
        "yfinance": "0083.HK",
        "region": "hongkong",
        "ir": "https://www.sino.com/en/investor-relations",
        "logo": "sino.com"
    },
    "1113.HK": {
        "name": "CK Asset Holdings",
        "yfinance": "1113.HK",
        "region": "hongkong",
        "ir": "https://www.ckah.com/en/investors",
        "logo": "ckah.com"
    },
    "0823.HK": {
        "name": "Link REIT",
        "yfinance": "0823.HK",
        "region": "hongkong",
        "ir": "https://www.linkreit.com/en/investors",
        "logo": "linkreit.com"
    },
    # Consumer
    "0027.HK": {
        "name": "Galaxy Entertainment Group",
        "yfinance": "0027.HK",
        "region": "hongkong",
        "ir": "https://www.galaxyentertainment.com/en/investors",
        "logo": "galaxyentertainment.com"
    },
    "1928.HK": {
        "name": "Sands China",
        "yfinance": "1928.HK",
        "region": "hongkong",
        "ir": "https://www.sandschina.com/investor-relations.html",
        "logo": "sandschina.com"
    },
    "0066.HK": {
        "name": "MTR Corporation",
        "yfinance": "0066.HK",
        "region": "hongkong",
        "ir": "https://www.mtr.com.hk/en/corporate/investor",
        "logo": "mtr.com.hk"
    },
    "0293.HK": {
        "name": "Cathay Pacific Airways",
        "yfinance": "0293.HK",
        "region": "hongkong",
        "ir": "https://www.cathaypacific.com/cx/en_HK/about-us/investor-relations.html",
        "logo": "cathaypacific.com"
    },
    "0019.HK": {
        "name": "Swire Pacific",
        "yfinance": "0019.HK",
        "region": "hongkong",
        "ir": "https://www.swirepacific.com/en/investor/overview.php",
        "logo": "swirepacific.com"
    },
    "0267.HK": {
        "name": "CITIC Pacific",
        "yfinance": "0267.HK",
        "region": "hongkong",
        "ir": "https://www.citic.com/en/investors",
        "logo": "citic.com"
    },
    "2020.HK": {
        "name": "ANTA Sports",
        "yfinance": "2020.HK",
        "region": "hongkong",
        "ir": "https://ir.anta.com",
        "logo": "anta.com"
    },
    "2331.HK": {
        "name": "Li Ning",
        "yfinance": "2331.HK",
        "region": "hongkong",
        "ir": "https://www.lining.com/en/investor_relations",
        "logo": "lining.com"
    },
    # Chinese Banks (H-shares)
    "1398.HK": {
        "name": "Industrial and Commercial Bank of China",
        "yfinance": "1398.HK",
        "region": "hongkong",
        "ir": "https://www.icbc-ltd.com/icbcltd/en/investor%20relations",
        "logo": "icbc.com.cn"
    },
    "3988.HK": {
        "name": "Bank of China",
        "yfinance": "3988.HK",
        "region": "hongkong",
        "ir": "https://www.boc.cn/en/investor",
        "logo": "boc.cn"
    },
    "0939.HK": {
        "name": "China Construction Bank",
        "yfinance": "0939.HK",
        "region": "hongkong",
        "ir": "http://en.ccb.com/en/investorrelations/investorhome.html",
        "logo": "ccb.com"
    },
    "1288.HK": {
        "name": "Agricultural Bank of China",
        "yfinance": "1288.HK",
        "region": "hongkong",
        "ir": "http://www.abchina.com/en/investor-relations",
        "logo": "abchina.com"
    },
    "3328.HK": {
        "name": "Bank of Communications",
        "yfinance": "3328.HK",
        "region": "hongkong",
        "ir": "https://www.bankcomm.com/BankCommSite/en/investor_relations",
        "logo": "bankcomm.com"
    },
    "0998.HK": {
        "name": "China CITIC Bank",
        "yfinance": "0998.HK",
        "region": "hongkong",
        "ir": "https://www.citicbank.com/en/ir",
        "logo": "citicbank.com"
    },
    # Chinese Energy
    "0883.HK": {
        "name": "CNOOC",
        "yfinance": "0883.HK",
        "region": "hongkong",
        "ir": "https://www.cnoocltd.com/en/investor",
        "logo": "cnoocltd.com"
    },
    "0857.HK": {
        "name": "PetroChina",
        "yfinance": "0857.HK",
        "region": "hongkong",
        "ir": "http://www.petrochina.com.cn/ptr/investor/common_index.shtml",
        "logo": "petrochina.com.cn"
    },
    "0386.HK": {
        "name": "Sinopec",
        "yfinance": "0386.HK",
        "region": "hongkong",
        "ir": "http://www.sinopec.com/listco/en/investor_centre",
        "logo": "sinopec.com"
    },
    "2007.HK": {
        "name": "Country Garden Holdings",
        "yfinance": "2007.HK",
        "region": "hongkong",
        "ir": "https://www.countrygarden.com.cn/en/investor",
        "logo": "countrygarden.com.cn"
    },
    "1211.HK": {
        "name": "BYD Company",
        "yfinance": "1211.HK",
        "region": "hongkong",
        "ir": "https://www.bydglobal.com/en/investors.html",
        "logo": "byd.com"
    },
    "0175.HK": {
        "name": "Geely Automobile Holdings",
        "yfinance": "0175.HK",
        "region": "hongkong",
        "ir": "http://www.geelyauto.com.hk/en/ir.html",
        "logo": "geelyauto.com.hk"
    },
    "2333.HK": {
        "name": "Great Wall Motor",
        "yfinance": "2333.HK",
        "region": "hongkong",
        "ir": "https://www.gwm.com.cn/en/investor",
        "logo": "gwm.com.cn"
    },
    "0914.HK": {
        "name": "Anhui Conch Cement",
        "yfinance": "0914.HK",
        "region": "hongkong",
        "ir": "http://www.conch.cn/en/investor",
        "logo": "conch.cn"
    },
    "3968.HK": {
        "name": "China Merchants Bank",
        "yfinance": "3968.HK",
        "region": "hongkong",
        "ir": "https://www.cmbchina.com/en/investor",
        "logo": "cmbchina.com"
    },
    "6862.HK": {
        "name": "Haidilao International",
        "yfinance": "6862.HK",
        "region": "hongkong",
        "ir": "https://www.haidilao.com/en/investor",
        "logo": "haidilao.com"
    },
    "0669.HK": {
        "name": "Techtronic Industries",
        "yfinance": "0669.HK",
        "region": "hongkong",
        "ir": "https://www.ttigroup.com/investors",
        "logo": "ttigroup.com"
    },
    "1177.HK": {
        "name": "Sino Biopharmaceutical",
        "yfinance": "1177.HK",
        "region": "hongkong",
        "ir": "https://www.sinobiopharm.com/en/investor.html",
        "logo": "sinobiopharm.com"
    },
    "2269.HK": {
        "name": "WuXi Biologics",
        "yfinance": "2269.HK",
        "region": "hongkong",
        "ir": "https://www.wuxibiologics.com/investor-relations",
        "logo": "wuxibiologics.com"
    },
    "6618.HK": {
        "name": "JD Health International",
        "yfinance": "6618.HK",
        "region": "hongkong",
        "ir": "https://ir.health.jd.com",
        "logo": "health.jd.com"
    },
}

# ============================================================================
# TOKYO STOCK EXCHANGE (.T)
# ============================================================================

TOKYO_STOCKS = {
    # Automotive
    "7203.T": {
        "name": "Toyota Motor",
        "yfinance": "7203.T",
        "region": "japan",
        "ir": "https://global.toyota/en/ir",
        "logo": "toyota.com"
    },
    "7267.T": {
        "name": "Honda Motor",
        "yfinance": "7267.T",
        "region": "japan",
        "ir": "https://global.honda/investors.html",
        "logo": "honda.com"
    },
    "7201.T": {
        "name": "Nissan Motor",
        "yfinance": "7201.T",
        "region": "japan",
        "ir": "https://www.nissan-global.com/EN/IR",
        "logo": "nissan.com"
    },
    "7269.T": {
        "name": "Suzuki Motor",
        "yfinance": "7269.T",
        "region": "japan",
        "ir": "https://www.suzuki.co.jp/ir/en",
        "logo": "suzuki.co.jp"
    },
    "7270.T": {
        "name": "Subaru",
        "yfinance": "7270.T",
        "region": "japan",
        "ir": "https://www.subaru.co.jp/en/ir",
        "logo": "subaru.co.jp"
    },
    "7261.T": {
        "name": "Mazda Motor",
        "yfinance": "7261.T",
        "region": "japan",
        "ir": "https://www.mazda.com/en/investors",
        "logo": "mazda.com"
    },
    # Electronics & Tech
    "6758.T": {
        "name": "Sony Group",
        "yfinance": "6758.T",
        "region": "japan",
        "ir": "https://www.sony.com/en/SonyInfo/IR",
        "logo": "sony.com"
    },
    "6501.T": {
        "name": "Hitachi",
        "yfinance": "6501.T",
        "region": "japan",
        "ir": "https://www.hitachi.com/IR-e",
        "logo": "hitachi.com"
    },
    "6502.T": {
        "name": "Toshiba",
        "yfinance": "6502.T",
        "region": "japan",
        "ir": "https://www.global.toshiba/ww/ir.html",
        "logo": "toshiba.com"
    },
    "6503.T": {
        "name": "Mitsubishi Electric",
        "yfinance": "6503.T",
        "region": "japan",
        "ir": "https://www.mitsubishielectric.com/en/investors",
        "logo": "mitsubishielectric.com"
    },
    "6752.T": {
        "name": "Panasonic Holdings",
        "yfinance": "6752.T",
        "region": "japan",
        "ir": "https://holdings.panasonic/global/corporate/investors.html",
        "logo": "panasonic.com"
    },
    "6954.T": {
        "name": "Fanuc",
        "yfinance": "6954.T",
        "region": "japan",
        "ir": "https://www.fanuc.co.jp/en/ir",
        "logo": "fanuc.co.jp"
    },
    "6861.T": {
        "name": "Keyence",
        "yfinance": "6861.T",
        "region": "japan",
        "ir": "https://www.keyence.co.jp/company/ir",
        "logo": "keyence.co.jp"
    },
    "6902.T": {
        "name": "Denso",
        "yfinance": "6902.T",
        "region": "japan",
        "ir": "https://www.denso.com/global/en/about-us/investors",
        "logo": "denso.com"
    },
    "6594.T": {
        "name": "Nidec",
        "yfinance": "6594.T",
        "region": "japan",
        "ir": "https://www.nidec.com/en/ir",
        "logo": "nidec.com"
    },
    "6723.T": {
        "name": "Renesas Electronics",
        "yfinance": "6723.T",
        "region": "japan",
        "ir": "https://www.renesas.com/us/en/about/company/investors",
        "logo": "renesas.com"
    },
    "6857.T": {
        "name": "Advantest",
        "yfinance": "6857.T",
        "region": "japan",
        "ir": "https://www.advantest.com/investors",
        "logo": "advantest.com"
    },
    "6920.T": {
        "name": "Lasertec",
        "yfinance": "6920.T",
        "region": "japan",
        "ir": "https://www.lasertec.co.jp/en/ir",
        "logo": "lasertec.co.jp"
    },
    "8035.T": {
        "name": "Tokyo Electron",
        "yfinance": "8035.T",
        "region": "japan",
        "ir": "https://www.tel.com/ir",
        "logo": "tel.com"
    },
    # Gaming
    "7974.T": {
        "name": "Nintendo",
        "yfinance": "7974.T",
        "region": "japan",
        "ir": "https://www.nintendo.co.jp/ir/en",
        "logo": "nintendo.com"
    },
    "9684.T": {
        "name": "Square Enix Holdings",
        "yfinance": "9684.T",
        "region": "japan",
        "ir": "https://www.hd.square-enix.com/eng/ir",
        "logo": "square-enix.com"
    },
    "9766.T": {
        "name": "Konami Holdings",
        "yfinance": "9766.T",
        "region": "japan",
        "ir": "https://www.konami.com/ir/en",
        "logo": "konami.com"
    },
    "7832.T": {
        "name": "Bandai Namco Holdings",
        "yfinance": "7832.T",
        "region": "japan",
        "ir": "https://www.bandainamco.co.jp/en/ir",
        "logo": "bandainamco.co.jp"
    },
    "9697.T": {
        "name": "Capcom",
        "yfinance": "9697.T",
        "region": "japan",
        "ir": "https://www.capcom.co.jp/ir/english",
        "logo": "capcom.co.jp"
    },
    "3659.T": {
        "name": "Nexon",
        "yfinance": "3659.T",
        "region": "japan",
        "ir": "https://ir.nexon.co.jp/en",
        "logo": "nexon.co.jp"
    },
    # Banks
    "8306.T": {
        "name": "Mitsubishi UFJ Financial Group",
        "yfinance": "8306.T",
        "region": "japan",
        "ir": "https://www.mufg.jp/english/ir",
        "logo": "mufg.jp"
    },
    "8316.T": {
        "name": "Sumitomo Mitsui Financial Group",
        "yfinance": "8316.T",
        "region": "japan",
        "ir": "https://www.smfg.co.jp/english/investor",
        "logo": "smfg.co.jp"
    },
    "8411.T": {
        "name": "Mizuho Financial Group",
        "yfinance": "8411.T",
        "region": "japan",
        "ir": "https://www.mizuho-fg.co.jp/english/investors",
        "logo": "mizuho-fg.co.jp"
    },
    "7182.T": {
        "name": "Japan Post Bank",
        "yfinance": "7182.T",
        "region": "japan",
        "ir": "https://www.jp-bank.japanpost.jp/en/aboutus/ir",
        "logo": "jp-bank.japanpost.jp"
    },
    "8309.T": {
        "name": "Sumitomo Mitsui Trust Holdings",
        "yfinance": "8309.T",
        "region": "japan",
        "ir": "https://www.smth.jp/en/ir",
        "logo": "smth.jp"
    },
    "8591.T": {
        "name": "ORIX Corporation",
        "yfinance": "8591.T",
        "region": "japan",
        "ir": "https://www.orix.co.jp/grp/en/ir",
        "logo": "orix.co.jp"
    },
    # Insurance
    "8766.T": {
        "name": "Tokio Marine Holdings",
        "yfinance": "8766.T",
        "region": "japan",
        "ir": "https://www.tokiomarinehd.com/en/ir",
        "logo": "tokiomarinehd.com"
    },
    "8725.T": {
        "name": "MS&AD Insurance Group Holdings",
        "yfinance": "8725.T",
        "region": "japan",
        "ir": "https://www.ms-ad-hd.com/en/ir.html",
        "logo": "ms-ad-hd.com"
    },
    "8630.T": {
        "name": "Sompo Holdings",
        "yfinance": "8630.T",
        "region": "japan",
        "ir": "https://www.sompo-hd.com/en/ir",
        "logo": "sompo-hd.com"
    },
    "8750.T": {
        "name": "Dai-ichi Life Holdings",
        "yfinance": "8750.T",
        "region": "japan",
        "ir": "https://www.dai-ichi-life-hd.com/en/investor",
        "logo": "dai-ichi-life-hd.com"
    },
    # Trading Companies
    "8058.T": {
        "name": "Mitsubishi Corporation",
        "yfinance": "8058.T",
        "region": "japan",
        "ir": "https://www.mitsubishicorp.com/jp/en/ir",
        "logo": "mitsubishicorp.com"
    },
    "8001.T": {
        "name": "ITOCHU Corporation",
        "yfinance": "8001.T",
        "region": "japan",
        "ir": "https://www.itochu.co.jp/en/ir",
        "logo": "itochu.co.jp"
    },
    "8031.T": {
        "name": "Mitsui & Co",
        "yfinance": "8031.T",
        "region": "japan",
        "ir": "https://www.mitsui.com/jp/en/ir",
        "logo": "mitsui.com"
    },
    "8053.T": {
        "name": "Sumitomo Corporation",
        "yfinance": "8053.T",
        "region": "japan",
        "ir": "https://www.sumitomocorp.com/en/jp/ir",
        "logo": "sumitomocorp.com"
    },
    "8002.T": {
        "name": "Marubeni Corporation",
        "yfinance": "8002.T",
        "region": "japan",
        "ir": "https://www.marubeni.com/en/ir",
        "logo": "marubeni.com"
    },
    # Pharma & Healthcare
    "4502.T": {
        "name": "Takeda Pharmaceutical",
        "yfinance": "4502.T",
        "region": "japan",
        "ir": "https://www.takeda.com/investors",
        "logo": "takeda.com"
    },
    "4503.T": {
        "name": "Astellas Pharma",
        "yfinance": "4503.T",
        "region": "japan",
        "ir": "https://www.astellas.com/en/investors",
        "logo": "astellas.com"
    },
    "4519.T": {
        "name": "Chugai Pharmaceutical",
        "yfinance": "4519.T",
        "region": "japan",
        "ir": "https://www.chugai-pharm.co.jp/english/ir",
        "logo": "chugai-pharm.co.jp"
    },
    "4568.T": {
        "name": "Daiichi Sankyo",
        "yfinance": "4568.T",
        "region": "japan",
        "ir": "https://www.daiichisankyo.com/investors",
        "logo": "daiichisankyo.com"
    },
    "4523.T": {
        "name": "Eisai",
        "yfinance": "4523.T",
        "region": "japan",
        "ir": "https://www.eisai.com/ir",
        "logo": "eisai.com"
    },
    "4578.T": {
        "name": "Otsuka Holdings",
        "yfinance": "4578.T",
        "region": "japan",
        "ir": "https://www.otsuka.com/en/ir",
        "logo": "otsuka.com"
    },
    "7741.T": {
        "name": "HOYA Corporation",
        "yfinance": "7741.T",
        "region": "japan",
        "ir": "https://www.hoya.com/ir",
        "logo": "hoya.com"
    },
    "4543.T": {
        "name": "Terumo",
        "yfinance": "4543.T",
        "region": "japan",
        "ir": "https://www.terumo.com/investors",
        "logo": "terumo.com"
    },
    "6869.T": {
        "name": "Sysmex",
        "yfinance": "6869.T",
        "region": "japan",
        "ir": "https://www.sysmex.co.jp/en/ir",
        "logo": "sysmex.co.jp"
    },
    # Telecom
    "9432.T": {
        "name": "Nippon Telegraph and Telephone",
        "yfinance": "9432.T",
        "region": "japan",
        "ir": "https://group.ntt/en/ir",
        "logo": "ntt.com"
    },
    "9433.T": {
        "name": "KDDI",
        "yfinance": "9433.T",
        "region": "japan",
        "ir": "https://www.kddi.com/english/corporate/ir",
        "logo": "kddi.com"
    },
    "9434.T": {
        "name": "SoftBank Corp",
        "yfinance": "9434.T",
        "region": "japan",
        "ir": "https://www.softbank.jp/en/corp/ir",
        "logo": "softbank.jp"
    },
    "4755.T": {
        "name": "Rakuten Group",
        "yfinance": "4755.T",
        "region": "japan",
        "ir": "https://global.rakuten.com/corp/investors",
        "logo": "rakuten.com"
    },
    "9984.T": {
        "name": "SoftBank Group",
        "yfinance": "9984.T",
        "region": "japan",
        "ir": "https://group.softbank/en/ir",
        "logo": "softbank.com"
    },
    # Consumer
    "9983.T": {
        "name": "Fast Retailing",
        "yfinance": "9983.T",
        "region": "japan",
        "ir": "https://www.fastretailing.com/eng/ir",
        "logo": "fastretailing.com"
    },
    "4911.T": {
        "name": "Shiseido",
        "yfinance": "4911.T",
        "region": "japan",
        "ir": "https://corp.shiseido.com/en/ir",
        "logo": "shiseido.com"
    },
    "4452.T": {
        "name": "Kao Corporation",
        "yfinance": "4452.T",
        "region": "japan",
        "ir": "https://www.kao.com/global/en/investor-relations",
        "logo": "kao.com"
    },
    "7751.T": {
        "name": "Canon",
        "yfinance": "7751.T",
        "region": "japan",
        "ir": "https://global.canon/en/ir",
        "logo": "canon.com"
    },
    "8113.T": {
        "name": "Unicharm",
        "yfinance": "8113.T",
        "region": "japan",
        "ir": "https://www.unicharm.co.jp/en/ir.html",
        "logo": "unicharm.co.jp"
    },
    "2914.T": {
        "name": "Japan Tobacco",
        "yfinance": "2914.T",
        "region": "japan",
        "ir": "https://www.jti.com/investors",
        "logo": "jti.com"
    },
    "2802.T": {
        "name": "Ajinomoto",
        "yfinance": "2802.T",
        "region": "japan",
        "ir": "https://www.ajinomoto.com/investors",
        "logo": "ajinomoto.com"
    },
    "2503.T": {
        "name": "Kirin Holdings",
        "yfinance": "2503.T",
        "region": "japan",
        "ir": "https://www.kirinholdings.com/en/investors",
        "logo": "kirinholdings.com"
    },
    "2502.T": {
        "name": "Asahi Group Holdings",
        "yfinance": "2502.T",
        "region": "japan",
        "ir": "https://www.asahigroup-holdings.com/en/ir",
        "logo": "asahigroup-holdings.com"
    },
    "2801.T": {
        "name": "Kikkoman",
        "yfinance": "2801.T",
        "region": "japan",
        "ir": "https://www.kikkoman.com/en/ir",
        "logo": "kikkoman.com"
    },
    # Industrial
    "7011.T": {
        "name": "Mitsubishi Heavy Industries",
        "yfinance": "7011.T",
        "region": "japan",
        "ir": "https://www.mhi.com/finance",
        "logo": "mhi.com"
    },
    "7012.T": {
        "name": "Kawasaki Heavy Industries",
        "yfinance": "7012.T",
        "region": "japan",
        "ir": "https://www.khi.co.jp/english/ir",
        "logo": "khi.co.jp"
    },
    "6301.T": {
        "name": "Komatsu",
        "yfinance": "6301.T",
        "region": "japan",
        "ir": "https://www.komatsu.jp/en/ir",
        "logo": "komatsu.jp"
    },
    "6305.T": {
        "name": "Hitachi Construction Machinery",
        "yfinance": "6305.T",
        "region": "japan",
        "ir": "https://www.hitachicm.com/global/en/ir",
        "logo": "hitachicm.com"
    },
    "5401.T": {
        "name": "Nippon Steel",
        "yfinance": "5401.T",
        "region": "japan",
        "ir": "https://www.nipponsteel.com/en/ir",
        "logo": "nipponsteel.com"
    },
    "5411.T": {
        "name": "JFE Holdings",
        "yfinance": "5411.T",
        "region": "japan",
        "ir": "https://www.jfe-holdings.co.jp/en/investor",
        "logo": "jfe-holdings.co.jp"
    },
    "5802.T": {
        "name": "Sumitomo Electric Industries",
        "yfinance": "5802.T",
        "region": "japan",
        "ir": "https://sumitomoelectric.com/investor-relations",
        "logo": "sumitomoelectric.com"
    },
    "5108.T": {
        "name": "Bridgestone",
        "yfinance": "5108.T",
        "region": "japan",
        "ir": "https://www.bridgestone.com/ir",
        "logo": "bridgestone.com"
    },
    "4063.T": {
        "name": "Shin-Etsu Chemical",
        "yfinance": "4063.T",
        "region": "japan",
        "ir": "https://www.shinetsu.co.jp/en/ir",
        "logo": "shinetsu.co.jp"
    },
    # Real Estate
    "8801.T": {
        "name": "Mitsui Fudosan",
        "yfinance": "8801.T",
        "region": "japan",
        "ir": "https://www.mitsuifudosan.co.jp/english/corporate/ir",
        "logo": "mitsuifudosan.co.jp"
    },
    "8802.T": {
        "name": "Mitsubishi Estate",
        "yfinance": "8802.T",
        "region": "japan",
        "ir": "https://www.mec.co.jp/e/investor",
        "logo": "mec.co.jp"
    },
    "8830.T": {
        "name": "Sumitomo Realty & Development",
        "yfinance": "8830.T",
        "region": "japan",
        "ir": "https://www.sumitomo-rd.co.jp/english/ir",
        "logo": "sumitomo-rd.co.jp"
    },
    # Rail & Transport
    "9020.T": {
        "name": "East Japan Railway",
        "yfinance": "9020.T",
        "region": "japan",
        "ir": "https://www.jreast.co.jp/e/investor",
        "logo": "jreast.co.jp"
    },
    "9022.T": {
        "name": "Central Japan Railway",
        "yfinance": "9022.T",
        "region": "japan",
        "ir": "https://company.jr-central.co.jp/ir/annualreport",
        "logo": "jr-central.co.jp"
    },
    "9021.T": {
        "name": "West Japan Railway",
        "yfinance": "9021.T",
        "region": "japan",
        "ir": "https://www.westjr.co.jp/global/en/ir",
        "logo": "westjr.co.jp"
    },
    # Internet & E-commerce
    "4689.T": {
        "name": "Z Holdings",
        "yfinance": "4689.T",
        "region": "japan",
        "ir": "https://www.z-holdings.co.jp/en/ir",
        "logo": "z-holdings.co.jp"
    },
    "4385.T": {
        "name": "Mercari",
        "yfinance": "4385.T",
        "region": "japan",
        "ir": "https://about.mercari.com/en/ir",
        "logo": "mercari.com"
    },
    "2371.T": {
        "name": "Kakaku.com",
        "yfinance": "2371.T",
        "region": "japan",
        "ir": "https://corporate.kakaku.com/en/ir",
        "logo": "kakaku.com"
    },
    "4751.T": {
        "name": "CyberAgent",
        "yfinance": "4751.T",
        "region": "japan",
        "ir": "https://www.cyberagent.co.jp/en/ir",
        "logo": "cyberagent.co.jp"
    },
    "6098.T": {
        "name": "Recruit Holdings",
        "yfinance": "6098.T",
        "region": "japan",
        "ir": "https://recruit-holdings.com/en/ir",
        "logo": "recruit-holdings.com"
    },
}

# ============================================================================
# SINGAPORE EXCHANGE (.SI)
# ============================================================================

SINGAPORE_STOCKS = {
    # Banks
    "D05.SI": {
        "name": "DBS Group Holdings",
        "yfinance": "D05.SI",
        "region": "singapore",
        "ir": "https://www.dbs.com/investor/index.html",
        "logo": "dbs.com"
    },
    "O39.SI": {
        "name": "Oversea-Chinese Banking Corporation",
        "yfinance": "O39.SI",
        "region": "singapore",
        "ir": "https://www.ocbc.com/group/investors.page",
        "logo": "ocbc.com"
    },
    "U11.SI": {
        "name": "United Overseas Bank",
        "yfinance": "U11.SI",
        "region": "singapore",
        "ir": "https://www.uobgroup.com/investor-relations",
        "logo": "uobgroup.com"
    },
    # Telecom
    "Z74.SI": {
        "name": "Singtel",
        "yfinance": "Z74.SI",
        "region": "singapore",
        "ir": "https://www.singtel.com/about-us/investor-relations",
        "logo": "singtel.com"
    },
    # Real Estate
    "C38U.SI": {
        "name": "CapitaLand Integrated Commercial Trust",
        "yfinance": "C38U.SI",
        "region": "singapore",
        "ir": "https://www.cict.com.sg/investor-relations",
        "logo": "cict.com.sg"
    },
    "A17U.SI": {
        "name": "CapitaLand Ascendas REIT",
        "yfinance": "A17U.SI",
        "region": "singapore",
        "ir": "https://www.capitaland-ascendas-reit.com/en/investor-relations.html",
        "logo": "capitaland-ascendas-reit.com"
    },
    "C09.SI": {
        "name": "City Developments",
        "yfinance": "C09.SI",
        "region": "singapore",
        "ir": "https://www.cdl.com.sg/investor-relations",
        "logo": "cdl.com.sg"
    },
    "U14.SI": {
        "name": "UOL Group",
        "yfinance": "U14.SI",
        "region": "singapore",
        "ir": "https://www.uol.com.sg/investor-relations",
        "logo": "uol.com.sg"
    },
    "ME8U.SI": {
        "name": "Mapletree Industrial Trust",
        "yfinance": "ME8U.SI",
        "region": "singapore",
        "ir": "https://www.mapletreeindustrialtrust.com/investor-relations",
        "logo": "mapletreeindustrialtrust.com"
    },
    "N2IU.SI": {
        "name": "Mapletree Logistics Trust",
        "yfinance": "N2IU.SI",
        "region": "singapore",
        "ir": "https://www.mapletreelogisticstrust.com/investor-relations",
        "logo": "mapletreelogisticstrust.com"
    },
    # Diversified
    "F34.SI": {
        "name": "Wilmar International",
        "yfinance": "F34.SI",
        "region": "singapore",
        "ir": "https://www.wilmar-international.com/investor-relations",
        "logo": "wilmar-international.com"
    },
    "C07.SI": {
        "name": "Jardine Cycle & Carriage",
        "yfinance": "C07.SI",
        "region": "singapore",
        "ir": "https://www.jcclgroup.com/investors",
        "logo": "jcclgroup.com"
    },
    "BN4.SI": {
        "name": "Keppel Corporation",
        "yfinance": "BN4.SI",
        "region": "singapore",
        "ir": "https://www.kepcorp.com/en/investors",
        "logo": "kepcorp.com"
    },
    "S58.SI": {
        "name": "SATS",
        "yfinance": "S58.SI",
        "region": "singapore",
        "ir": "https://www.sats.com.sg/investor-relations",
        "logo": "sats.com.sg"
    },
    "C52.SI": {
        "name": "ComfortDelGro",
        "yfinance": "C52.SI",
        "region": "singapore",
        "ir": "https://www.comfortdelgro.com/investor-relations",
        "logo": "comfortdelgro.com"
    },
    "Y92.SI": {
        "name": "Thai Beverage",
        "yfinance": "Y92.SI",
        "region": "singapore",
        "ir": "https://www.thaibev.com/en08/investor.aspx",
        "logo": "thaibev.com"
    },
    "S63.SI": {
        "name": "Singapore Technologies Engineering",
        "yfinance": "S63.SI",
        "region": "singapore",
        "ir": "https://www.stengg.com/en/investor-relations",
        "logo": "stengg.com"
    },
    "V03.SI": {
        "name": "Venture Corporation",
        "yfinance": "V03.SI",
        "region": "singapore",
        "ir": "https://www.venture.com.sg/investor-relations",
        "logo": "venture.com.sg"
    },
    "S68.SI": {
        "name": "Singapore Exchange",
        "yfinance": "S68.SI",
        "region": "singapore",
        "ir": "https://investorrelations.sgx.com",
        "logo": "sgx.com"
    },
    # Healthcare
    "1D0.SI": {
        "name": "Raffles Medical Group",
        "yfinance": "1D0.SI",
        "region": "singapore",
        "ir": "https://www.rafflesmedicalgroup.com/investor-relations",
        "logo": "rafflesmedicalgroup.com"
    },
}

# ============================================================================
# ADDITIONAL EUROPEAN MINING STOCKS
# ============================================================================

EUROPEAN_MINING_STOCKS = {
    # Add Boliden properly (it exists but named wrong)
    "BOLI.ST": {
        "name": "Boliden",
        "yfinance": "BOL.ST",
        "region": "europe",
        "ir": "https://www.boliden.com/investor-relations",
        "logo": "boliden.com"
    },
    # More Scandinavian mining
    "LUMI.HE": {
        "name": "Outokumpu",
        "yfinance": "OUT1V.HE",
        "region": "europe",
        "ir": "https://www.outokumpu.com/en/investors",
        "logo": "outokumpu.com"
    },
    # UK Mining
    "ANTO.L": {
        "name": "Antofagasta",
        "yfinance": "ANTO.L",
        "region": "europe",
        "ir": "https://www.antofagasta.co.uk/investors",
        "logo": "antofagasta.co.uk"
    },
    "FRES.L": {
        "name": "Fresnillo",
        "yfinance": "FRES.L",
        "region": "europe",
        "ir": "https://www.fresnilloplc.com/investors",
        "logo": "fresnilloplc.com"
    },
    "POLY.L": {
        "name": "Polymetal International",
        "yfinance": "POLY.L",
        "region": "europe",
        "ir": "https://www.polymetalinternational.com/en/for-investors",
        "logo": "polymetalinternational.com"
    },
    "HGM.L": {
        "name": "Hochschild Mining",
        "yfinance": "HGM.L",
        "region": "europe",
        "ir": "https://www.hochschildmining.com/en/investors",
        "logo": "hochschildmining.com"
    },
    "CEY.L": {
        "name": "Centamin",
        "yfinance": "CEY.L",
        "region": "europe",
        "ir": "https://www.centamin.com/investors",
        "logo": "centamin.com"
    },
    "KAZ.L": {
        "name": "Kazatomprom",
        "yfinance": "KAZ.L",
        "region": "europe",
        "ir": "https://www.kazatomprom.kz/en/investors",
        "logo": "kazatomprom.kz"
    },
}


def main():
    print("Loading existing stocks...")
    stocks = load_stocks()
    original_count = len(stocks)

    print(f"\nOriginal count: {original_count}")

    # Apply fixes
    print("\nApplying data fixes...")
    for ticker, data in DATA_FIXES.items():
        stocks[ticker] = data
        print(f"  Fixed: {ticker} -> {data['name']}")

    # Add missing US stocks
    print("\nAdding missing US stocks...")
    for ticker, data in MISSING_US_STOCKS.items():
        if ticker not in stocks:
            stocks[ticker] = data
            print(f"  Added: {ticker} ({data['name']})")

    # Add Toronto stocks
    print("\nAdding Toronto Stock Exchange stocks...")
    for ticker, data in TORONTO_STOCKS.items():
        if ticker not in stocks:
            stocks[ticker] = data
            print(f"  Added: {ticker} ({data['name']})")

    # Add Australian stocks
    print("\nAdding Australian Stock Exchange stocks...")
    for ticker, data in AUSTRALIAN_STOCKS.items():
        if ticker not in stocks:
            stocks[ticker] = data
            print(f"  Added: {ticker} ({data['name']})")

    # Add Hong Kong stocks
    print("\nAdding Hong Kong Stock Exchange stocks...")
    for ticker, data in HONG_KONG_STOCKS.items():
        if ticker not in stocks:
            stocks[ticker] = data
            print(f"  Added: {ticker} ({data['name']})")

    # Add Tokyo stocks
    print("\nAdding Tokyo Stock Exchange stocks...")
    for ticker, data in TOKYO_STOCKS.items():
        if ticker not in stocks:
            stocks[ticker] = data
            print(f"  Added: {ticker} ({data['name']})")

    # Add Singapore stocks
    print("\nAdding Singapore Stock Exchange stocks...")
    for ticker, data in SINGAPORE_STOCKS.items():
        if ticker not in stocks:
            stocks[ticker] = data
            print(f"  Added: {ticker} ({data['name']})")

    # Add European mining stocks
    print("\nAdding European mining stocks...")
    for ticker, data in EUROPEAN_MINING_STOCKS.items():
        if ticker not in stocks:
            stocks[ticker] = data
            print(f"  Added: {ticker} ({data['name']})")

    # Save
    save_stocks(stocks)

    new_count = len(stocks)
    print(f"\n{'='*50}")
    print(f"Summary:")
    print(f"  Original stocks: {original_count}")
    print(f"  New stocks:      {new_count}")
    print(f"  Added:           {new_count - original_count}")

    # Print region breakdown
    regions = {}
    for v in stocks.values():
        region = v.get('region', 'unknown')
        regions[region] = regions.get(region, 0) + 1

    print(f"\nBy region:")
    for region, count in sorted(regions.items(), key=lambda x: -x[1]):
        print(f"  {region}: {count}")


if __name__ == '__main__':
    main()
