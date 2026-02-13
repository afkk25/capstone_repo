
# import requests
# import pandas as pd
# import folium
# import json


# url = "https://storageacntcasabusonly.blob.core.windows.net/gtfs/shape/312.json"

# response = requests.get(url)
# data = response.json()

# print(type(data["RoutePolylines"]))
# print(len(data["RoutePolylines"]))
# print(data["RoutePolylines"][0])





# polylines = data["RoutePolylines"]
# df = pd.DataFrame(polylines)
# print(df.head())





# # Assume structure has Latitude and Longitude
# coordinates = [(float(point["Latitude"]), float(point["Longitude"])) for point in polylines]

# m = folium.Map(location=coordinates[0], zoom_start=13)
# folium.PolyLine(coordinates).add_to(m)

# m.save("route_312.html")

BASE_DIR = "D:/Capstone/capstone_repo"
DATA_DIR = f"{BASE_DIR}/data/raw"



# import requests
# import pandas as pd
# import folium
# import json


# url = "https://storageacntcasabusonly.blob.core.windows.net/gtfs/stops.json"

# response = requests.get(url)
# data = response.json()

# print(type(data))
# print(len(data))
# print(data[0])
# print(data[1])

# stops_df = pd.DataFrame(data)
# print(stops_df.head())

# stops_df.to_csv(f"{DATA_DIR}/stops.csv", index=False)


import requests
import pandas as pd
import folium
import json


url = "https://storageacntcasabusonly.blob.core.windows.net/gtfs/Lignes.json"

response = requests.get(url)
print(response.status_code)
print(response.headers.get("content-type"))
print(response.text[:500])

# data = response.json()

# print(type(data))
# print(len(data))
# print(data[0])
# print(data[1])

# routes_df = pd.DataFrame(data)
# print(routes_df.head())


