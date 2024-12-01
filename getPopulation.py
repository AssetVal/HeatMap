import json
import requests
import os
from dotenv import load_dotenv, dotenv_values
from shapely.geometry import shape
import pandas as pd

def process_county_data():
    # Load environment variables
    load_dotenv()
    api_key = os.getenv("CENSUS_KEY")
    
    # Load GeoJSON
    with open('public/data/cb_2023_us_county_20m.geojson', 'r') as f:
        geojson = json.load(f)

    # Use 2022 5-year estimates instead of 2023 1-year
    year = "2022"
    url = f"https://api.census.gov/data/{year}/acs/acs5?get=NAME,B01003_001E&for=county:*&key={api_key}"
    
    # Add error handling and debug info
    response = requests.get(url)
    print(f"Status Code: {response.status_code}")
    print(f"Response Text: {response.text[:200]}...")  # Print first 200 chars
    
    if response.status_code != 200:
        raise Exception(f"Census API error: {response.text}")
        
    try:
        census_data = response.json()
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {str(e)}")
        print(f"Full response: {response.text}")
        raise

    # Rest of processing remains the same
    df = pd.DataFrame(census_data[1:], columns=census_data[0])
    df['FIPS'] = df['state'] + df['county']
    df['population'] = pd.to_numeric(df['B01003_001E'])
    
    pop_by_fips = df.set_index('FIPS')['population'].to_dict()

    for feature in geojson['features']:
        state_fips = feature['properties']['STATEFP']
        county_fips = feature['properties']['COUNTYFP']
        fips = state_fips + county_fips
        
        population = pop_by_fips.get(fips, 0)
        # Fix: Convert square degrees to square kilometers
        # 1 degree is approximately 111 km at the equator
        area_sq_deg = shape(feature['geometry']).area
        area_km2 = area_sq_deg * (111 * 111)  # approximate conversion
        density = population / area_km2 if area_km2 > 0 else 0
        
        feature['properties'].update({
            'population': population,
            'area_km2': area_km2,
            'density': density
        })

    output_path = 'public/data/counties-with-population.geojson'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(geojson, f)

    print(f"Processed {len(geojson['features'])} counties")
    print(f"Saved to {output_path}")

if __name__ == "__main__":
    process_county_data()
