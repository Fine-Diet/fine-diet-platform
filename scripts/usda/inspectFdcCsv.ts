/**
 * USDA FoodData Central CSV Schema Discovery Script
 * 
 * Reads CSV files in each USDA dataset folder and prints headers
 * to understand the structure before ingestion.
 * 
 * Usage: npx ts-node scripts/usda/inspectFdcCsv.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const DATA_ROOT = path.join(__dirname, '../../data/usa_fdc');

// Dataset folders to inspect
const DATASETS = [
  { name: 'foundation', folder: 'FoodData_Central_foundation_food_csv_2025-12-18' },
  { name: 'branded', folder: 'FoodData_Central_branded_food_csv_2025-12-18' },
  { name: 'sr_legacy', folder: 'FoodData_Central_sr_legacy_food_csv_2018-04' },
  { name: 'survey', folder: 'FoodData_Central_survey_food_csv_2024-10-31' },
];

// Key files we care about for ingestion (in order of importance)
const KEY_FILES = [
  'food.csv',
  'nutrient.csv',
  'food_nutrient.csv',
  'branded_food.csv',
  'food_portion.csv',
  'food_category.csv',
  'measure_unit.csv',
  'foundation_food.csv',
  'sr_legacy_food.csv',
  'survey_fndds_food.csv',
  'wweia_food_category.csv',
];

interface FileInfo {
  name: string;
  exists: boolean;
  headers: string[];
  sampleRow?: string[];
  rowCount?: number;
}

async function readFirstLines(filePath: string, count: number = 2): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    
    rl.on('line', (line) => {
      lines.push(line);
      if (lines.length >= count) {
        rl.close();
        stream.destroy();
      }
    });
    
    rl.on('close', () => resolve(lines));
    rl.on('error', reject);
    stream.on('error', reject);
  });
}

async function countLines(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0;
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    
    rl.on('line', () => count++);
    rl.on('close', () => resolve(count - 1)); // Subtract header
    rl.on('error', reject);
    stream.on('error', reject);
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}

async function inspectDataset(datasetName: string, folderName: string): Promise<Map<string, FileInfo>> {
  const datasetPath = path.join(DATA_ROOT, folderName);
  const fileInfoMap = new Map<string, FileInfo>();
  
  if (!fs.existsSync(datasetPath)) {
    console.error(`  ⚠️  Folder not found: ${datasetPath}`);
    return fileInfoMap;
  }
  
  const allFiles = fs.readdirSync(datasetPath).filter(f => f.endsWith('.csv'));
  
  // Process key files first, then others
  const orderedFiles = [
    ...KEY_FILES.filter(f => allFiles.includes(f)),
    ...allFiles.filter(f => !KEY_FILES.includes(f)),
  ];
  
  for (const fileName of orderedFiles) {
    const filePath = path.join(datasetPath, fileName);
    const isKeyFile = KEY_FILES.includes(fileName);
    
    try {
      const lines = await readFirstLines(filePath, 2);
      const headers = parseCSVLine(lines[0] || '');
      const sampleRow = lines[1] ? parseCSVLine(lines[1]) : undefined;
      
      // Only count rows for key files (expensive operation)
      let rowCount: number | undefined;
      if (isKeyFile) {
        rowCount = await countLines(filePath);
      }
      
      fileInfoMap.set(fileName, {
        name: fileName,
        exists: true,
        headers,
        sampleRow,
        rowCount,
      });
    } catch (error) {
      fileInfoMap.set(fileName, {
        name: fileName,
        exists: false,
        headers: [],
      });
    }
  }
  
  return fileInfoMap;
}

function printDatasetReport(datasetName: string, fileInfoMap: Map<string, FileInfo>): void {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📁 Dataset: ${datasetName.toUpperCase()}`);
  console.log('='.repeat(80));
  
  // Key files first
  console.log('\n🔑 Key Files:');
  for (const keyFile of KEY_FILES) {
    const info = fileInfoMap.get(keyFile);
    if (!info || !info.exists) continue;
    
    console.log(`\n  📄 ${keyFile} (${info.rowCount?.toLocaleString() ?? '?'} rows)`);
    console.log(`     Headers: ${info.headers.join(', ')}`);
    if (info.sampleRow && info.sampleRow.length > 0) {
      const sample = info.headers.slice(0, 5).map((h, i) => `${h}=${info.sampleRow![i] ?? ''}`).join(', ');
      console.log(`     Sample:  ${sample}${info.headers.length > 5 ? ', ...' : ''}`);
    }
  }
  
  // Other files summary
  const otherFiles = Array.from(fileInfoMap.keys()).filter(f => !KEY_FILES.includes(f));
  if (otherFiles.length > 0) {
    console.log(`\n  📦 Other files: ${otherFiles.join(', ')}`);
  }
}

function printNutrientMapping(allNutrients: Map<string, { id: string; name: string; unit: string }>): void {
  console.log(`\n${'='.repeat(80)}`);
  console.log('🧪 Key Nutrient IDs for Mapping');
  console.log('='.repeat(80));
  
  // Common nutrient IDs in USDA FDC
  const targetNutrients = [
    { search: ['Energy', 'kcal', 'KCAL'], ourField: 'calories' },
    { search: ['Protein'], ourField: 'protein_g' },
    { search: ['Carbohydrate'], ourField: 'carbs_g' },
    { search: ['Total lipid', 'Fat'], ourField: 'fat_g' },
    { search: ['Fiber'], ourField: 'fiber_g' },
    { search: ['Sugars', 'Sugar'], ourField: 'sugar_g' },
    { search: ['Sodium'], ourField: 'sodium_mg' },
  ];
  
  console.log('\n  Mapping to food_objects fields:');
  for (const target of targetNutrients) {
    const matches = Array.from(allNutrients.values()).filter(n => 
      target.search.some(s => n.name.toLowerCase().includes(s.toLowerCase()))
    );
    if (matches.length > 0) {
      console.log(`\n  ${target.ourField}:`);
      matches.slice(0, 3).forEach(m => console.log(`    - ID ${m.id}: "${m.name}" (${m.unit})`));
    }
  }
}

async function main(): Promise<void> {
  console.log('🔍 USDA FoodData Central CSV Schema Inspector');
  console.log(`   Data root: ${DATA_ROOT}`);
  console.log(`   Inspecting ${DATASETS.length} datasets...`);
  
  const allNutrients = new Map<string, { id: string; name: string; unit: string }>();
  
  for (const dataset of DATASETS) {
    const fileInfoMap = await inspectDataset(dataset.name, dataset.folder);
    printDatasetReport(dataset.name, fileInfoMap);
    
    // Collect nutrient info
    const nutrientInfo = fileInfoMap.get('nutrient.csv');
    if (nutrientInfo?.exists && nutrientInfo.sampleRow) {
      // Read more nutrient rows to build mapping
      const nutrientPath = path.join(DATA_ROOT, dataset.folder, 'nutrient.csv');
      try {
        const lines = await readFirstLines(nutrientPath, 100);
        const headers = parseCSVLine(lines[0]);
        const idIdx = headers.indexOf('id');
        const nameIdx = headers.indexOf('name');
        const unitIdx = headers.indexOf('unit_name');
        
        for (let i = 1; i < lines.length; i++) {
          const row = parseCSVLine(lines[i]);
          if (row[idIdx] && row[nameIdx]) {
            allNutrients.set(row[idIdx], {
              id: row[idIdx],
              name: row[nameIdx],
              unit: row[unitIdx] || '',
            });
          }
        }
      } catch (e) {
        // Ignore
      }
    }
  }
  
  printNutrientMapping(allNutrients);
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ Inspection complete');
  console.log('='.repeat(80));
}

main().catch(console.error);
