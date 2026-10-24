using System.ComponentModel;
using Terraria;
using Terraria.Graphics.Light;
using Terraria.Localization;
using Terraria.ModLoader.Config;

namespace Lights;

public class LightsConfig : ModConfig
{
	public override ConfigScope Mode => (ConfigScope)1;

	[Header("Lighting")]
	[Label("开启光照（Use Lights）")]
	[DefaultValue(true)]
	public bool UseLight { get; set; }

	[Label("光照强度（Lights intensity）")]
	[Range(0.4f, 1.5f)]
	[DefaultValue(1f)]
	public float lightIntensity { get; set; }

	[Label("月光强度（Moon Light intensity）")]
	[Range(0.4f, 1.1f)]
	[DefaultValue(1f)]
	public float moonlightIntensity { get; set; }

	[Label("阴影强度（Shadow intensity）")]
	[Range(0.4f, 1.5f)]
	[DefaultValue(1f)]
	public float shadowIntensity { get; set; }

	[Label("Daylight Color")]
	[DrawTicks]
	[OptionStrings(new string[] { "Classic", "Alternate" })]
	[Tooltip("Classic: Midday light is yellow\nAlternate: Midday light is white")]
	[DefaultValue("Classic")]
	public string dayColor { get; set; }

	[Header("Bloom")]
	[Label("开启外发光（Use Bloom）")]
	[DefaultValue(true)]
	public bool UseBloom { get; set; }

	[Label("外发光强度（Bloom Intensity）")]
	[Range(0.2f, 1.25f)]
	[DefaultValue(1f)]
	public float BloomIntensity { get; set; }

	[Label("Bloom迭代次数（Bloom Counts）")]
	[Range(1, 10)]
	[DefaultValue(4)]
	public int BloomCounts { get; set; }

	public override bool AcceptClientChanges(ModConfig pendingConfig, int whoAmI, ref NetworkText message)
	{
		return true;
	}

	public override void OnChanged()
	{
		//IL_000d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0013: Invalid comparison between Unknown and I4
		//IL_0015: Unknown result type (might be due to invalid IL or missing references)
		//IL_001b: Invalid comparison between Unknown and I4
		if (Main.WaveQuality == 0)
		{
			Main.WaveQuality = 2;
		}
		if ((int)Lighting.Mode == 2 || (int)Lighting.Mode == 1)
		{
			Lighting.Mode = (LightMode)3;
		}
		Lights.LightIntensity = lightIntensity;
		Lights.useBloom = UseBloom;
		Lights.useLight = UseLight;
		Lights.ShadowIntensity = shadowIntensity;
		Lights.bloomIntensity = BloomIntensity;
		Lights.MoonLightIntensity = moonlightIntensity;
		Lights.bloomCounts = BloomCounts;
	}
}
