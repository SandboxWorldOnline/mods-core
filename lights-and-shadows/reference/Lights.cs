using System;
using System.Reflection;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using ReLogic.Content;
using Terraria;
using Terraria.Graphics.Capture;
using Terraria.Graphics.Effects;
using Terraria.ModLoader;

namespace Lights;

public class Lights : Mod
{
	public delegate void orig_EndCapture(object self, RenderTarget2D finalTexture, RenderTarget2D screenTarget1, RenderTarget2D screenTarget2, Color clearColor);

	public static bool useLight = true;

	public static bool useBloom = true;

	public static float LightIntensity = 1f;

	public static bool softBlend = true;

	public static float ShadowIntensity = 1f;

	public static float bloomIntensity = 1f;

	public static float MoonLightIntensity = 1f;

	public static bool fasttime = false;

	public RenderTarget2D screen;

	public RenderTarget2D light;

	public RenderTarget2D bloom;

	public RenderTarget2D saveImage;

	public static Effect Light;

	public static Effect Shadow;

	public static Effect Bloom;

	public static int quality = 3;

	public static int bloomCounts = 4;

	public void ResetRenderTarget()
	{
		//IL_0061: Unknown result type (might be due to invalid IL or missing references)
		//IL_0067: Unknown result type (might be due to invalid IL or missing references)
		//IL_0071: Expected Obj, but got Unknown
		//IL_0090: Unknown result type (might be due to invalid IL or missing references)
		//IL_0096: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a0: Expected Obj, but got Unknown
		//IL_00c3: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c9: Unknown result type (might be due to invalid IL or missing references)
		//IL_00d3: Expected Obj, but got Unknown
		RenderTarget2D val = screen;
		if (val != null)
		{
			((GraphicsResource)val).Dispose();
		}
		RenderTarget2D val2 = light;
		if (val2 != null)
		{
			((GraphicsResource)val2).Dispose();
		}
		RenderTarget2D val3 = bloom;
		if (val3 != null)
		{
			((GraphicsResource)val3).Dispose();
		}
		GraphicsDevice graphicsDevice = Main.graphics.GraphicsDevice;
		screen = new RenderTarget2D(graphicsDevice, graphicsDevice.PresentationParameters.BackBufferWidth / 3, graphicsDevice.PresentationParameters.BackBufferHeight / 3, false, graphicsDevice.PresentationParameters.BackBufferFormat, (DepthFormat)0);
		light = new RenderTarget2D(graphicsDevice, graphicsDevice.PresentationParameters.BackBufferWidth, graphicsDevice.PresentationParameters.BackBufferHeight, false, graphicsDevice.PresentationParameters.BackBufferFormat, (DepthFormat)0);
		bloom = new RenderTarget2D(graphicsDevice, graphicsDevice.PresentationParameters.BackBufferWidth / 3, graphicsDevice.PresentationParameters.BackBufferHeight / 3, false, graphicsDevice.PresentationParameters.BackBufferFormat, (DepthFormat)0);
	}

	public void NewScreenTarget()
	{
		//IL_0033: Unknown result type (might be due to invalid IL or missing references)
		//IL_003b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0045: Expected Obj, but got Unknown
		GraphicsDevice graphicsDevice = Main.graphics.GraphicsDevice;
		((GraphicsResource)Main.screenTarget).Dispose();
		Main.screenTarget = new RenderTarget2D(graphicsDevice, graphicsDevice.PresentationParameters.BackBufferWidth, graphicsDevice.PresentationParameters.BackBufferHeight, false, graphicsDevice.PresentationParameters.BackBufferFormat, (DepthFormat)0, 0, (RenderTargetUsage)1);
	}

	public override void Load()
	{
		//IL_0000: Unknown result type (might be due to invalid IL or missing references)
		//IL_000a: Expected Obj, but got Unknown
		//IL_001e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0028: Expected Obj, but got Unknown
		MethodInfo method = ((object)new FilterManager()).GetType().GetMethod("EndCapture", BindingFlags.Instance | BindingFlags.Public);
		On_Main.InitTargets_int_int += On_Main_InitTargets_int_int;
		if (!Main.dedServ && (object)method != null)
		{
			Light = ModContent.Request<Effect>("Lights/Effects/Light", (AssetRequestMode)1).Value;
			Shadow = ModContent.Request<Effect>("Lights/Effects/Shadow", (AssetRequestMode)1).Value;
			Bloom = ModContent.Request<Effect>("Lights/Effects/Bloom1", (AssetRequestMode)1).Value;
			MonoModHooks.Add((MethodBase)method, (Delegate)new Action<orig_EndCapture, FilterManager, RenderTarget2D, RenderTarget2D, RenderTarget2D, Color>(FilterManager_EndCapture));
		}
	}

	private void On_Main_InitTargets_int_int(orig_InitTargets_int_int orig, Main self, int width, int height)
	{
		orig.Invoke(self, width, height);
		ResetRenderTarget();
		NewScreenTarget();
	}

	public override void Unload()
	{
		Light = null;
		Shadow = null;
		Bloom = null;
		screen = null;
		light = null;
		bloom = null;
	}

	public void FilterManager_EndCapture(orig_EndCapture orig, FilterManager self, RenderTarget2D finalTexture, RenderTarget2D screenTarget1, RenderTarget2D screenTarget2, Color clearColor)
	{
		//IL_0069: Unknown result type (might be due to invalid IL or missing references)
		//IL_0022: Unknown result type (might be due to invalid IL or missing references)
		GraphicsDevice graphicsDevice = Main.graphics.GraphicsDevice;
		SpriteBatch spriteBatch = Main.spriteBatch;
		if (!CaptureManager.Instance.IsCapturing)
		{
			if ((int)Main.screenTarget.RenderTargetUsage == 0)
			{
				NewScreenTarget();
			}
			if (screen == null)
			{
				ResetRenderTarget();
			}
			if (useLight)
			{
				UseLightAndShadow(graphicsDevice, spriteBatch, screenTarget1, screenTarget2);
			}
			if (useBloom)
			{
				UseBloom(graphicsDevice, screenTarget1, screenTarget2);
			}
		}
		orig(self, finalTexture, screenTarget1, screenTarget2, clearColor);
	}

	private void UseBloom(GraphicsDevice graphicsDevice, RenderTarget2D rt1, RenderTarget2D rt2)
	{
		//IL_0038: Unknown result type (might be due to invalid IL or missing references)
		//IL_0058: Unknown result type (might be due to invalid IL or missing references)
		//IL_0066: Unknown result type (might be due to invalid IL or missing references)
		//IL_0070: Unknown result type (might be due to invalid IL or missing references)
		//IL_009c: Unknown result type (might be due to invalid IL or missing references)
		//IL_010f: Unknown result type (might be due to invalid IL or missing references)
		//IL_011d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0127: Unknown result type (might be due to invalid IL or missing references)
		//IL_0194: Unknown result type (might be due to invalid IL or missing references)
		//IL_019e: Unknown result type (might be due to invalid IL or missing references)
		//IL_028c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0300: Unknown result type (might be due to invalid IL or missing references)
		//IL_021c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0362: Unknown result type (might be due to invalid IL or missing references)
		//IL_0370: Unknown result type (might be due to invalid IL or missing references)
		//IL_037a: Unknown result type (might be due to invalid IL or missing references)
		//IL_023e: Unknown result type (might be due to invalid IL or missing references)
		//IL_024c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0256: Unknown result type (might be due to invalid IL or missing references)
		if (((Texture2D)screen).Width != ((Texture2D)rt1).Width / 3 || ((Texture2D)screen).Height != ((Texture2D)rt1).Height / 3)
		{
			ResetRenderTarget();
		}
		graphicsDevice.SetRenderTarget(rt2);
		graphicsDevice.Clear(Color.Black);
		Main.spriteBatch.Begin((SpriteSortMode)1, BlendState.AlphaBlend);
		Main.spriteBatch.Draw((Texture2D)(object)rt1, Vector2.Zero, (Rectangle?)null, Color.White, 0f, Vector2.Zero, 1f, (SpriteEffects)0, 0f);
		Main.spriteBatch.End();
		graphicsDevice.SetRenderTarget(screen);
		graphicsDevice.Clear(Color.Black);
		Main.spriteBatch.Begin((SpriteSortMode)1, BlendState.AlphaBlend, SamplerState.LinearClamp, DepthStencilState.None, RasterizerState.CullNone);
		Bloom.Parameters["m"].SetValue(0.71f - bloomIntensity * 0.01f);
		Bloom.CurrentTechnique.Passes[0].Apply();
		Main.spriteBatch.Draw((Texture2D)(object)rt1, Vector2.Zero, (Rectangle?)null, Color.White, 0f, Vector2.Zero, 1f / 3f, (SpriteEffects)0, 0f);
		Main.spriteBatch.End();
		Main.spriteBatch.Begin((SpriteSortMode)1, BlendState.AlphaBlend, SamplerState.LinearClamp, DepthStencilState.None, RasterizerState.CullNone);
		Effect value = ModContent.Request<Effect>("Lights/Effects/KawaseBlur", (AssetRequestMode)1).Value;
		value.Parameters["uScreenResolution"].SetValue(new Vector2((float)((Texture2D)rt1).Width, (float)((Texture2D)rt2).Height) / 2.5f);
		value.Parameters["uIntensity"].SetValue(1f + (float)bloomCounts * 0.005f);
		for (int i = 0; i < bloomCounts; i++)
		{
			value.Parameters["distance"].SetValue(i);
			value.CurrentTechnique.Passes[0].Apply();
			graphicsDevice.SetRenderTarget((i % 2 == 0) ? bloom : screen);
			graphicsDevice.Clear(Color.Black);
			Main.spriteBatch.Draw((Texture2D)(object)((i % 2 == 0) ? screen : bloom), Vector2.Zero, (Rectangle?)null, Color.White, 0f, Vector2.Zero, 1f, (SpriteEffects)0, 0f);
		}
		Main.spriteBatch.End();
		graphicsDevice.SetRenderTarget(rt1);
		graphicsDevice.Clear(Color.Black);
		Main.spriteBatch.Begin((SpriteSortMode)1, BlendState.Additive);
		Bloom.Parameters["tex0"].SetValue((Texture)(object)rt2);
		Bloom.Parameters["p"].SetValue(4.5f);
		Bloom.Parameters["uScreenResolution"].SetValue(new Vector2((float)((Texture2D)rt1).Width, (float)((Texture2D)rt2).Height));
		Bloom.Parameters["m2"].SetValue(bloomIntensity);
		Bloom.CurrentTechnique.Passes["Blend"].Apply();
		Main.spriteBatch.Draw((Texture2D)(object)((bloomCounts % 2 == 0) ? screen : bloom), Vector2.Zero, (Rectangle?)null, Color.White, 0f, Vector2.Zero, 3f, (SpriteEffects)0, 0f);
		Main.spriteBatch.End();
	}

	private float Gauss(float x, float sigma)
	{
		return 0.4f * (float)Math.Exp(-0.5f * x * x / sigma);
	}

	public static void SetQuality(int q)
	{
		if (quality != q)
		{
			quality = q;
		}
	}

	private void UseLightAndShadow(GraphicsDevice gd, SpriteBatch sb, RenderTarget2D rt1, RenderTarget2D rt2)
	{
		//IL_000d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0045: Unknown result type (might be due to invalid IL or missing references)
		//IL_0064: Unknown result type (might be due to invalid IL or missing references)
		//IL_006a: Unknown result type (might be due to invalid IL or missing references)
		//IL_00d4: Unknown result type (might be due to invalid IL or missing references)
		//IL_00d9: Unknown result type (might be due to invalid IL or missing references)
		//IL_0234: Unknown result type (might be due to invalid IL or missing references)
		//IL_025b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0346: Unknown result type (might be due to invalid IL or missing references)
		//IL_03ad: Unknown result type (might be due to invalid IL or missing references)
		//IL_03e5: Unknown result type (might be due to invalid IL or missing references)
		//IL_038b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0390: Unknown result type (might be due to invalid IL or missing references)
		//IL_046e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0474: Unknown result type (might be due to invalid IL or missing references)
		//IL_049a: Unknown result type (might be due to invalid IL or missing references)
		//IL_049f: Unknown result type (might be due to invalid IL or missing references)
		//IL_04ae: Unknown result type (might be due to invalid IL or missing references)
		//IL_04b8: Unknown result type (might be due to invalid IL or missing references)
		//IL_04cd: Expected Obj, but got Unknown
		//IL_04e0: Unknown result type (might be due to invalid IL or missing references)
		//IL_0604: Unknown result type (might be due to invalid IL or missing references)
		//IL_060a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0614: Unknown result type (might be due to invalid IL or missing references)
		//IL_0623: Unknown result type (might be due to invalid IL or missing references)
		//IL_062a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0635: Unknown result type (might be due to invalid IL or missing references)
		//IL_063f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0664: Expected Obj, but got Unknown
		//IL_06a6: Unknown result type (might be due to invalid IL or missing references)
		//IL_06b0: Expected Obj, but got Unknown
		//IL_06d1: Unknown result type (might be due to invalid IL or missing references)
		//IL_06d6: Unknown result type (might be due to invalid IL or missing references)
		//IL_06db: Unknown result type (might be due to invalid IL or missing references)
		//IL_06e5: Expected Obj, but got Unknown
		//IL_0520: Unknown result type (might be due to invalid IL or missing references)
		//IL_0525: Unknown result type (might be due to invalid IL or missing references)
		//IL_055c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0562: Unknown result type (might be due to invalid IL or missing references)
		//IL_056c: Unknown result type (might be due to invalid IL or missing references)
		//IL_057b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0583: Unknown result type (might be due to invalid IL or missing references)
		//IL_058d: Unknown result type (might be due to invalid IL or missing references)
		//IL_05cc: Expected Obj, but got Unknown
		gd.SetRenderTarget(light);
		gd.Clear(Color.Black);
		sb.Begin((SpriteSortMode)1, BlendState.NonPremultiplied);
		Light.Parameters["uScreenResolution"].SetValue(new Vector2((float)((Texture2D)rt1).Width, (float)((Texture2D)rt1).Height));
		Light.Parameters["uPos"].SetValue(ToScreenCoords(GetSunPos(rt1), rt1));
		string text = ((ModContent.GetInstance<LightsConfig>().dayColor == "Classic") ? "ColorTex" : "ColorTex_Alt");
		Light.Parameters["tex0"].SetValue((Texture)(object)(Texture2D)ModContent.Request<Texture2D>("Lights/" + (Main.dayTime ? text : "ColorTex2"), (AssetRequestMode)2));
		Color colorOfTheSkies = Main.ColorOfTheSkies;
		float num = (1f - 1.2f * (float)(int)colorOfTheSkies.R * 0.3f + (float)(int)colorOfTheSkies.G * 0.6f + (float)(int)colorOfTheSkies.B * 0.1f) / 255f;
		float lightIntensity = LightIntensity;
		if (Main.LocalPlayer.ZoneSnow && !Main.LocalPlayer.ZoneCrimson && !Main.LocalPlayer.ZoneCorrupt)
		{
			num -= Main.bgAlphaFrontLayer[7] * 0.1f;
		}
		if (Main.LocalPlayer.ZoneCrimson)
		{
			num += 0.3f;
		}
		if (Main.snowBG[0] == 263 || Main.snowBG[0] == 258 || Main.snowBG[0] == 267)
		{
			num -= Main.bgAlphaFrontLayer[7] * 1f;
		}
		if (Main.snowBG[0] == 263)
		{
			num -= Main.bgAlphaFrontLayer[7] * 0.5f;
		}
		if (Main.desertBG[0] == 248)
		{
			num -= Main.bgAlphaFrontLayer[2] * 0.9f;
		}
		float num2 = 1f;
		if (Main.moonPhase == 0)
		{
			num2 = 1.01f;
		}
		if (Main.moonPhase == 3 || Main.moonPhase == 5)
		{
			num2 = 0.9f;
		}
		if (Main.moonPhase == 4)
		{
			num2 = 0.6f;
		}
		float num3 = 0.8f * lightIntensity * (1f + num * 0.4f);
		if ((double)(((Entity)Main.LocalPlayer).Center.Y / 16f) > Main.worldSurface - 150.0)
		{
			float num4 = ((Entity)Main.LocalPlayer).Center.Y / 16f - ((float)Main.worldSurface - 150f);
			num2 *= 1f - num4 / 200f;
			num3 *= 1f - num4 / 600f;
		}
		Light.Parameters["intensity"].SetValue(Main.dayTime ? num3 : (0.8f * MoonLightIntensity * num2));
		Light.Parameters["t"].SetValue((float)Main.time / 54000f);
		if (!Main.dayTime)
		{
			Light.Parameters["t"].SetValue((float)Main.time / 32400f);
		}
		Light.CurrentTechnique.Passes["Light"].Apply();
		if ((double)((Entity)Main.LocalPlayer).Center.Y < Main.worldSurface * 16.0 + 800.0)
		{
			sb.Draw((Texture2D)ModContent.Request<Texture2D>("Lights/PixelEX", (AssetRequestMode)2), new Rectangle(0, 0, ((Texture2D)rt1).Width, ((Texture2D)rt1).Height), Color.White);
		}
		sb.End();
		gd.SetRenderTarget(screen);
		gd.Clear(Color.Black);
		sb.Begin((SpriteSortMode)1, BlendState.Additive);
		Shadow.Parameters["uScreenResolution"].SetValue(new Vector2((float)((Texture2D)rt1).Width, (float)((Texture2D)rt1).Height));
		float num5 = Main.bgAlphaFrontLayer[2] * 0.09f;
		if (Main.desertBG[0] == 248)
		{
			num5 = 0f;
		}
		Shadow.Parameters["m"].SetValue(1f - num5);
		if (!Main.dayTime)
		{
			Shadow.Parameters["m"].SetValue(0.02f);
		}
		Shadow.Parameters["uPos"].SetValue(ToScreenCoords(GetSunPos(rt1), rt1));
		Shadow.CurrentTechnique.Passes[0].Apply();
		sb.Draw((Texture2D)rt1, Vector2.Zero, (Rectangle?)null, Color.White, 0f, Vector2.Zero, 0.333f, (SpriteEffects)0, 0f);
		sb.End();
		gd.SetRenderTarget(bloom);
		gd.Clear(Color.Black);
		sb.Begin((SpriteSortMode)0, BlendState.Additive);
		if (Main.dayTime)
		{
			float num6 = 120f;
			for (int i = 0; i < 30; i++)
			{
				float num7 = 0.55f * (float)(30 - i) / num6;
				Color white = Color.White;
				white.A = (byte)((float)(int)white.A * num7 * (ShadowIntensity + 0.1f) * (num3 * 0.5f - 0.1f));
				sb.Draw((Texture2D)screen, GetSunPos(rt1) / 3f, (Rectangle?)null, white, 0f, GetSunPos(rt1) / 3f, 1f * (1f + (float)i * (1f / (float)quality) * (0.014f + (float)quality * 0.01f)), (SpriteEffects)0, 0f);
			}
		}
		else
		{
			for (int j = 0; j < 20; j++)
			{
				float num8 = 190f;
				float num9 = (20f - (float)j) / num8;
				sb.Draw((Texture2D)screen, GetSunPos(rt1) / 3f, (Rectangle?)null, Color.White * num9, 0f, GetSunPos(rt1) / 3f, 1f * (1f + (float)j * 0.01f), (SpriteEffects)0, 0f);
			}
		}
		sb.End();
		gd.SetRenderTarget(rt1);
		sb.Begin((SpriteSortMode)1, BlendState.Additive);
		Shadow.Parameters["tex0"].SetValue((Texture)bloom);
		Shadow.CurrentTechnique.Passes[1].Apply();
		sb.Draw((Texture2D)light, Vector2.Zero, Color.White);
		sb.End();
	}

	public static Vector2 ToScreenCoords(Vector2 vec, RenderTarget2D render)
	{
		//IL_0000: Unknown result type (might be due to invalid IL or missing references)
		//IL_000f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0014: Unknown result type (might be due to invalid IL or missing references)
		return vec / new Vector2((float)((Texture2D)render).Width, (float)((Texture2D)render).Height);
	}

	public static Vector2 GetSunPos(RenderTarget2D render)
	{
		//IL_00b3: Unknown result type (might be due to invalid IL or missing references)
		//IL_00aa: Unknown result type (might be due to invalid IL or missing references)
		float num = (Main.dayTime ? 27000 : 16200);
		float num2 = (0f - Main.screenPosition.Y) / (float)(Main.worldSurface * 16.0 - 600.0) * 200f;
		float num3 = 1f - (float)Main.time / num;
		float num4 = (1f - num3) * (float)((Texture2D)render).Width / 2f - 100f * num3;
		float num5 = num3 * num3;
		float num6 = num2 + num5 * 250f + 180f;
		if (Main.LocalPlayer != null && Main.LocalPlayer.gravDir == -1f)
		{
			return new Vector2(num4, (float)((Texture2D)render).Height - num6);
		}
		return new Vector2(num4, num6);
	}
}
