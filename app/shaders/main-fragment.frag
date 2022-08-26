#version 300 es
precision highp float;

#define CSM_TEXTURE_SIZE 2048.

#define zNear 0.3
#define CSM_PLANE_DISTANCE0 50.
#define CSM_PLANE_DISTANCE1 110.
#define zFar 180.

in highp vec4 VNormal;
in highp vec4 FragPos;
in highp vec4 UntransformedFragPos;
in lowp vec4 Color;

uniform vec3 viewPos;
uniform vec3 lightDir;
uniform mat4 viewMatrix;

uniform mat4[3] csm_matrices;
uniform highp sampler2DShadow csm_textures[3];
uniform highp sampler2D groundTexture;

out vec4 O;

// Shadow bias
// Could be computed based on normal and light, something like 0.0003 * (1. -
// clamp(dot(normal, lightDir), 0., 1.))
const float shadowBias = 0.000175;

float ShadowCalculation() {
  float depthValue = abs((viewMatrix * FragPos).z);

  // Gets the fragment position in light space
  vec4 csmCoords = csm_matrices[depthValue < CSM_PLANE_DISTANCE0 ? 0 : depthValue < CSM_PLANE_DISTANCE1 ? 1 : 2] * FragPos;

  // perform perspective divide and transform to [0,1] range
  csmCoords = (csmCoords / csmCoords.w) * .5 + .5;

  if (csmCoords.z > 1.) {
    return 1.; // Outside of far plane, skip.
  }

  // TODO: once we have real dimensions and cascades size,
  // we can try to adjust the shadow interpolation to avoid artifacts.
  // The idea is to adjust the blur size depending on the distance and/or
  // cascade index.

  float shadow = 0.;

  for (float x = -1.; x <= 1.; ++x) {
    for (float y = -1.; y <= 1.; ++y) {
      vec3 c = vec3(csmCoords.xy + vec2(x, y) / CSM_TEXTURE_SIZE, csmCoords.z - shadowBias);
      shadow += depthValue < CSM_PLANE_DISTANCE0 ? texture(csm_textures[0], c)
        : depthValue < CSM_PLANE_DISTANCE1       ? texture(csm_textures[1], c)
                                                 : texture(csm_textures[2], c);
    }
  }

  return mix((shadow / 9.), 1., sqrt(depthValue / zFar) * .9);
}

void main() {
  vec3 normal = normalize(VNormal.xyz);

  vec3 rgbColor = Color.xyz;

  rgbColor *= Color.w > 0. ? 1.
      - Color.w
        * dot(
          abs(normal),
          vec3(
            texture(groundTexture, UntransformedFragPos.yz * .035).x,
            texture(groundTexture, UntransformedFragPos.xz * .035).x,
            texture(groundTexture, UntransformedFragPos.xy * .035).x
          )
        )
                           : 1.;

  vec3 lightColor = vec3(0.9, 0.9, 0.9);

  vec3 ambient = 0.3 * rgbColor;

  float diff = max(dot(lightDir, normal), 0.0);
  vec3 diffuse = diff * lightColor;
  // specular
  vec3 viewDir = normalize(viewPos - FragPos.xyz);
  vec3 halfwayDir = normalize(lightDir + viewDir);
  vec3 specular = pow(max(dot(normal, halfwayDir), 0.0), 64.0) * lightColor;

  // calculate shadow
  float shadow = ShadowCalculation();

  vec3 lighting = (ambient + mix(diffuse * .3, diffuse + specular, shadow)) * (rgbColor);

  O = vec4(lighting, 1.0f);

  // color += 0.125 * (concrete.x - concrete.y + concrete.z - concrete.w);
}
