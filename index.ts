import { appendFile, createWriteStream } from "node:fs"

const BASE_URL = 'https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax/records';
const SELECT_VALUES: string[] = ['date', 'origine', 'destination', 'heure_depart', 'heure_arrivee', 'od_happy_card as tgvmax'];
const LIMIT = '100';

type Operator = '=' | 'IN' | 'LIKE';

interface WhereCondition {
  field: string;
  operator: Operator;
  value: string;
  or?: WhereCondition[];
}

const WHERE_CONDITIONS: WhereCondition[] = [
  { field: 'date', operator: 'IN', value: "[date'2024-08-12'..date'2024-08-15']" },
  { 
    field: 'origine', 
    operator: 'LIKE', 
    value: "'%Paris%'",
    or: [{ field: 'origine', operator: 'LIKE', value: "'%Marne%'" }, { field: 'origine', operator: 'LIKE', value: "'%Aéroport%'" }]
},
  { 
    field: 'destination', 
    operator: 'LIKE', 
    value: "'%Marseille%'",
    or: [{ field: 'destination', operator: 'LIKE', value: "'%Toulon%'" }]
  },
  { field: 'tgvmax', operator: '=', value: "'OUI'" }
];

const ORDER_BY = 'date asc';

function buildWhereClause(conditions: WhereCondition[]): string {
  return conditions.map(condition => {
    let clause = `${condition.field} ${condition.operator} ${condition.value}`;
    if (condition.or) {
      const orClauses = condition.or.map(orCondition => 
        `${orCondition.field} ${orCondition.operator} ${orCondition.value}`
      );
      clause = `(${clause} OR ${orClauses.join(' OR ')})`;
    }
    return clause;
  }).join(' AND ');
}

interface TGVMaxData {
  date: string;
  origine: string;
  destination: string;
  heure_depart: string;
  heure_arrivee: string;
  tgvmax: string;
}

async function fetchTGVMaxData(): Promise<TGVMaxData[]> {
  const url = new URL(BASE_URL);
  url.searchParams.set('limit', LIMIT);
  url.searchParams.set('select', SELECT_VALUES.join(','));
  url.searchParams.set('where', buildWhereClause(WHERE_CONDITIONS));
  url.searchParams.set('order_by', ORDER_BY);

  try {
    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: { results: TGVMaxData[] } = await response.json();
    if(data.results.length > 0) {
      await fillLogFile(data.results);
    } else {
        await fillLogFile([]);
    }
    return data.results;
  } catch (error) {
    console.error('Erreur lors de la récupération des données:', error);
    throw error;
  }
}

async function sendSMSIfResults(r: TGVMaxData[]): Promise<void> {
    if(r.length > 0) {
        console.log("Train dispo !! ", r);
    } else {
        console.log("Pas de train dispo (recherche faite le " + new Date().toLocaleDateString() + " à " + new Date().toLocaleTimeString() + ") !! ");
    }
}

async function fillLogFile(r: TGVMaxData[]): Promise<void> {
  const logFile = createWriteStream('log.txt', { flags: 'a' });
  logFile.write(new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString() + "\n");
  logFile.write("Train dispo : " + r.length + "\n");
  logFile.end();
}

// Exécution de la fonction
let times = 0;
const interval = setInterval(() => {
    fetchTGVMaxData()
    .then(sendSMSIfResults)
    .catch(error => {
    console.error('Une erreur est survenue:', error);
    }).finally(() => {
        times++;
        if(times >= 20160 ) {
            clearInterval(interval);
            console.log("Arrêt de l'intervalle");
        }
    });
}, 1000 * 5 );

