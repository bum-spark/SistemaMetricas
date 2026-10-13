// SDK de métricas de Estudio Xolos — núcleo sin dependencias de Unity.
// JSON mínimo escrito a mano: sin reflexión (seguro con IL2CPP y "code stripping"),
// sin paquetes extra, y con soporte para lo que JsonUtility no hace (diccionarios,
// objetos `data` flexibles y null). Solo cubre los tipos que usa el SDK.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace EstudioXolos.Metricas
{
    public static class JsonEscritor
    {
        public static string Serializar(object valor)
        {
            var sb = new StringBuilder();
            Escribir(sb, valor);
            return sb.ToString();
        }

        private static void Escribir(StringBuilder sb, object valor)
        {
            switch (valor)
            {
                case null:
                    sb.Append("null");
                    break;
                case string s:
                    EscribirTexto(sb, s);
                    break;
                case bool b:
                    sb.Append(b ? "true" : "false");
                    break;
                case int i:
                    sb.Append(i.ToString(CultureInfo.InvariantCulture));
                    break;
                case long l:
                    sb.Append(l.ToString(CultureInfo.InvariantCulture));
                    break;
                case float f:
                    EscribirNumero(sb, f);
                    break;
                case double d:
                    EscribirNumero(sb, d);
                    break;
                case IDictionary<string, object> objeto:
                    sb.Append('{');
                    var primero = true;
                    foreach (var par in objeto)
                    {
                        if (!primero) sb.Append(',');
                        primero = false;
                        EscribirTexto(sb, par.Key);
                        sb.Append(':');
                        Escribir(sb, par.Value);
                    }
                    sb.Append('}');
                    break;
                case IEnumerable lista:
                    sb.Append('[');
                    var primerElemento = true;
                    foreach (var elemento in lista)
                    {
                        if (!primerElemento) sb.Append(',');
                        primerElemento = false;
                        Escribir(sb, elemento);
                    }
                    sb.Append(']');
                    break;
                default:
                    throw new ArgumentException("Tipo no soportado por JsonEscritor: " + valor.GetType().Name);
            }
        }

        private static void EscribirNumero(StringBuilder sb, double d)
        {
            if (double.IsNaN(d) || double.IsInfinity(d))
            {
                throw new ArgumentException("JSON no admite NaN ni infinito.");
            }
            // Siempre con punto decimal, sin importar el idioma del sistema del jugador.
            sb.Append(d.ToString("R", CultureInfo.InvariantCulture));
        }

        private static void EscribirTexto(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (var c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < 0x20)
                        {
                            sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }
            sb.Append('"');
        }
    }

    // Lector JSON mínimo para las respuestas de la API: objetos → Dictionary<string, object>,
    // arreglos → List<object>, números → double, más string, bool y null.
    public static class JsonLector
    {
        public static object Parsear(string json)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));
            var pos = 0;
            var valor = LeerValor(json, ref pos);
            SaltarEspacios(json, ref pos);
            if (pos != json.Length) throw new FormatException("Contenido extra después del JSON.");
            return valor;
        }

        private static object LeerValor(string s, ref int pos)
        {
            SaltarEspacios(s, ref pos);
            if (pos >= s.Length) throw new FormatException("JSON incompleto.");
            var c = s[pos];
            if (c == '{') return LeerObjeto(s, ref pos);
            if (c == '[') return LeerArreglo(s, ref pos);
            if (c == '"') return LeerTexto(s, ref pos);
            if (c == 't') { Esperar(s, ref pos, "true"); return true; }
            if (c == 'f') { Esperar(s, ref pos, "false"); return false; }
            if (c == 'n') { Esperar(s, ref pos, "null"); return null; }
            return LeerNumero(s, ref pos);
        }

        private static Dictionary<string, object> LeerObjeto(string s, ref int pos)
        {
            var objeto = new Dictionary<string, object>();
            pos++; // {
            SaltarEspacios(s, ref pos);
            if (pos < s.Length && s[pos] == '}') { pos++; return objeto; }
            while (true)
            {
                SaltarEspacios(s, ref pos);
                var clave = LeerTexto(s, ref pos);
                SaltarEspacios(s, ref pos);
                if (pos >= s.Length || s[pos] != ':') throw new FormatException("Se esperaba ':'.");
                pos++;
                objeto[clave] = LeerValor(s, ref pos);
                SaltarEspacios(s, ref pos);
                if (pos >= s.Length) throw new FormatException("Objeto sin cerrar.");
                if (s[pos] == ',') { pos++; continue; }
                if (s[pos] == '}') { pos++; return objeto; }
                throw new FormatException("Se esperaba ',' o '}'.");
            }
        }

        private static List<object> LeerArreglo(string s, ref int pos)
        {
            var lista = new List<object>();
            pos++; // [
            SaltarEspacios(s, ref pos);
            if (pos < s.Length && s[pos] == ']') { pos++; return lista; }
            while (true)
            {
                lista.Add(LeerValor(s, ref pos));
                SaltarEspacios(s, ref pos);
                if (pos >= s.Length) throw new FormatException("Arreglo sin cerrar.");
                if (s[pos] == ',') { pos++; continue; }
                if (s[pos] == ']') { pos++; return lista; }
                throw new FormatException("Se esperaba ',' o ']'.");
            }
        }

        private static string LeerTexto(string s, ref int pos)
        {
            if (pos >= s.Length || s[pos] != '"') throw new FormatException("Se esperaba un texto.");
            pos++;
            var sb = new StringBuilder();
            while (pos < s.Length)
            {
                var c = s[pos++];
                if (c == '"') return sb.ToString();
                if (c != '\\') { sb.Append(c); continue; }
                if (pos >= s.Length) break;
                var e = s[pos++];
                switch (e)
                {
                    case '"': sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/': sb.Append('/'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u':
                        if (pos + 4 > s.Length) throw new FormatException("Escape \\u incompleto.");
                        sb.Append((char)int.Parse(s.Substring(pos, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                        pos += 4;
                        break;
                    default: throw new FormatException("Escape desconocido.");
                }
            }
            throw new FormatException("Texto sin cerrar.");
        }

        private static double LeerNumero(string s, ref int pos)
        {
            var inicio = pos;
            while (pos < s.Length && "+-0123456789.eE".IndexOf(s[pos]) >= 0) pos++;
            if (inicio == pos) throw new FormatException("Valor JSON inválido en la posición " + inicio + ".");
            return double.Parse(s.Substring(inicio, pos - inicio), NumberStyles.Float, CultureInfo.InvariantCulture);
        }

        private static void Esperar(string s, ref int pos, string literal)
        {
            if (string.CompareOrdinal(s, pos, literal, 0, literal.Length) != 0) throw new FormatException("Se esperaba " + literal + ".");
            pos += literal.Length;
        }

        private static void SaltarEspacios(string s, ref int pos)
        {
            while (pos < s.Length && char.IsWhiteSpace(s[pos])) pos++;
        }
    }
}
