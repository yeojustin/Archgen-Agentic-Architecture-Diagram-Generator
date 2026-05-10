from google import genai
import os

def test_imagen():
    try:
        client = genai.Client()
        print("Client initialized")
        # Just check if models.generate_image exists
        print(hasattr(client.models, 'generate_image'))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_imagen()
