
import requests
import pandas as pd
import folium
import json

BASE_DIR = "D:/Capstone/capstone_repo"
DATA_DIR = f"{BASE_DIR}/data/raw"

############################# CasaBUS ###############################
url = "https://storageacntcasabusonly.blob.core.windows.net/gtfs/stops.json"

response = requests.get(url)
data = response.json()

df = pd.DataFrame(data["Stops"])
df.to_csv(f'{DATA_DIR}/CasaBus_stops.csv', index=False)


# url = "https://storageacntcasabusonly.blob.core.windows.net/gtfs/shapes/312.json"
# polylines = data["RoutePolylines"]
# df = pd.DataFrame(polylines)
# print(df.head())
# coordinates = [(float(point["Latitude"]), float(point["Longitude"])) for point in polylines]
# m = folium.Map(location=coordinates[0], zoom_start=13)
# folium.PolyLine(coordinates).add_to(m)
# m.save("route_312.html")


######################### BusWay / TramWay ###############################


url = "https://www.casatramway.ma/pthv/get/stops-line-discovery"

# We will loop through the tram lines T1 to T4 to collect stop data for each line
lines = ["T1", "T2", "T3", "T4", "BW1", "BW2"]  

for line in lines:

    params = {
        "max": 1000,
        "reseau": "",
        "line": line,
        "direction": ""
    }

    # Some APIs require a User-Agent header to prevent blocking, so we include it here
    headers = {
        "User-Agent": "Mozilla/5.0"
    }

    response = requests.get(url, params=params, headers=headers)


    data = response.json()

    # Flatten nested dictionaries and lists into a DataFrame
    df = pd.json_normalize(data['items'])

    # This creates clean columns like 'StopName.value' and 'Location.Latitude'
    # print(df[['StopPointRef', 'StopName.value', 'Location.Latitude', 'Location.Longitude']].head())

    # Save to CSV for your data collection step
    df.to_csv(f'{DATA_DIR}/Casaway/Casaway_{line}_stops.csv', index=False)