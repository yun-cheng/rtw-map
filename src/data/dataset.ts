import advisoriesJson from '../../data/gen/advisories.json'
import airJson from '../../data/gen/air.json'
import amenitiesJson from '../../data/gen/amenities.json'
import citiesJson from '../../data/gen/cities.json'
import climateJson from '../../data/gen/climate.json'
import connectionsJson from '../../data/gen/connections.json'
import costsJson from '../../data/gen/costs.json'
import countriesJson from '../../data/gen/countries.json'
import fxJson from '../../data/gen/fx.json'
import healthJson from '../../data/gen/health.json'
import localTransportJson from '../../data/gen/local-transport.json'
import noticesJson from '../../data/gen/notices.json'
import paymentsJson from '../../data/gen/payments.json'
import populationJson from '../../data/gen/population.json'
import roadsJson from '../../data/gen/roads.json'
import shoppingJson from '../../data/gen/shopping.json'
import visaJson from '../../data/gen/visa.json'
import type { Dataset } from '../planner/types'

const byKey = <T, K extends keyof T>(xs: T[], k: K) => Object.fromEntries(xs.map((x) => [x[k] as string, x]))

export const dataset: Dataset = {
  countries: byKey(countriesJson.countries, 'iso2'),
  cities: byKey(citiesJson.cities, 'id'),
  climate: climateJson.climate as Dataset['climate'],
  costs: costsJson.costs as Dataset['costs'],
  connections: connectionsJson.connections as Dataset['connections'],
  roads: roadsJson.roads,
  visa: visaJson as unknown as Dataset['visa'],
  advisories: advisoriesJson.advisories as Dataset['advisories'],
  fx: fxJson,
  notices: noticesJson.notices,
  population: populationJson.population,
  localTransport: localTransportJson as unknown as Dataset['localTransport'],
  health: healthJson as unknown as Dataset['health'],
  air: { whoDaily: airJson.whoDaily, byCity: airJson.air as Dataset['air']['byCity'] },
  amenities: { radiusKm: amenitiesJson.radiusKm, byCity: amenitiesJson.amenities as Dataset['amenities']['byCity'] },
  shopping: shoppingJson.countries as Dataset['shopping'],
  payments: paymentsJson as unknown as Dataset['payments'],
  meta: {
    cities: citiesJson._meta,
    climate: climateJson._meta,
    costs: costsJson._meta,
    connections: connectionsJson._meta,
    roads: roadsJson._meta,
    visa: visaJson._meta,
    advisories: advisoriesJson._meta,
    fx: fxJson._meta,
    countries: countriesJson._meta,
    population: populationJson._meta,
    localTransport: localTransportJson._meta,
    health: healthJson._meta,
    air: airJson._meta,
    amenities: amenitiesJson._meta,
    shopping: shoppingJson._meta,
    payments: paymentsJson._meta,
  },
}
