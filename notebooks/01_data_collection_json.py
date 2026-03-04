
import requests
import pandas as pd
import folium
import json
import os

BASE_DIR = "D:/Capstone/capstone_repo"
DATA_DIR = f"{BASE_DIR}/data/raw"

############################# CasaBUS ###############################
# url = "https://storageacntcasabusonly.blob.core.windows.net/gtfs/stops.json"

# response = requests.get(url)
# data = response.json()

# df = pd.DataFrame(data)
# route_ids = df["RouteId"].unique()
# route_ids = route_ids.tolist()
# df.to_csv(f'{DATA_DIR}/CasaBus_stops.csv', index=False)



############# Bus Routes ############
# create folder to save maps
os.makedirs(f"{DATA_DIR}/route_maps", exist_ok=True)
route_ids = ['13', '50', '84', '9E', '604', '67', '72', '55', '68', '51', '312',
       '600', '109', '97B', '5', '902', '904', '82', '903', '301', '800',
       '43', '64', '79', '307', '606', '6', '65', '19', '608', '23',
       '900', '32D', '33', '39', '97', '38', '60', '120', '62', '63',
       '143', '107', '22', '906', '306', '40', '56', '90', '7', '139',
       '20', '31', '905', '310', '300', '309', '907', '11']

route_shapes = []


for route in route_ids:
    url = f"https://storageacntcasabusonly.blob.core.windows.net/gtfs/shape/{route}.json"
    
    try:
        response = requests.get(url)
        print(response.status_code)
        data = response.json()
        
        polylines = data["RoutePolylines"]
        
        # get coordinates
        coordinates = [(float(point["Latitude"]), float(point["Longitude"])) for point in polylines]
            
        # Route shapes
        route_shapes.append({"RouteId": route, "Coordinates": coordinates})

        # create map
        m = folium.Map(location=coordinates[0], zoom_start=13)
        folium.PolyLine(coordinates, color="blue", weight=3).add_to(m)
            
        # save map
        m.save(f"{DATA_DIR}/route_maps/route_{route}.html")
        print(f"Route {route} saved successfully.")
        
    except Exception as e:
        print(f"Failed to process route {route}: {e}")

df_routes = pd.DataFrame(route_shapes)
df_routes.to_csv(f'{DATA_DIR}/CasaBus_routes.csv', index=False)


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